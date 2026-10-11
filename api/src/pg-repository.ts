// Repositórios Postgres (Supabase). Ver db/README.md para o schema e os protocolos.
//
// - A API conecta direto (DATABASE_URL): a RLS NÃO se aplica, então toda query filtra por
//   user_id = app_user do usuário corrente (resolvido via contexto, ver app-user.ts).
// - `game.code` é o id público (Game.id). Status/vontade são enums em inglês no banco e
//   rótulos pt-BR na API (mapas abaixo).
// - Toda operação é UMA instrução SQL (atômica por si, sem BEGIN/COMMIT): leituras trazem os
//   jogos num json_agg já no formato da API; escritas compostas usam CTEs que modificam dados.
//   Com `prepare: false` o driver faz describe + execute em cada query parametrizada
//   (2 round trips), e transações explícitas somariam mais 2 (BEGIN/COMMIT) sem pipelining —
//   por isso evitamos múltiplos statements.
import type {
  Desire,
  Game,
  GameStatus,
  ManualAdjustment,
  ManualMove,
  Recommendations,
} from '../../shared/models.ts';
import postgres from 'postgres';
import type { Sql } from './db.ts';
/** Valor serializado como json pelo driver (sql.json). */
const json = (v: unknown) => v as postgres.JSONValue;
import type { AppUserResolver } from './app-user.ts';
import type { GameRepository, QueueInputs, QueueSnapshotStore, StoredQueue } from './repository.ts';
import type { ManualAdjustmentRepository } from './manual-repository.ts';
import { AppError } from './service.ts';

/** Muda quando a regra de scoring.ts muda: invalida todos os snapshots da fila. */
export const ALGORITHM_VERSION = 'scoring-1';

const statusCode: Record<GameStatus, string> = {
  'Não iniciado': 'not_started',
  Jogando: 'playing',
  Abandonado: 'abandoned',
  Finalizado: 'finished',
};
const desireCode: Record<Desire, string> = {
  'Muito Alta': 'very_high',
  Alta: 'high',
  Média: 'medium',
  Baixa: 'low',
  'Muito Baixa': 'very_low',
};
const invert = <K extends string>(m: Record<K, string>) =>
  Object.fromEntries(Object.entries(m).map(([k, v]) => [v, k])) as Record<string, K>;
const statusLabel = invert(statusCode);
const desireLabel = invert(desireCode);

const isoTs = (col: string) =>
  `to_char(${col} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;

/** Uma linha de library_entry (+ game e vocabulários) no formato de `Game`. */
const GAME_JSON = `json_build_object(
  'id', g.code, 'name', g.name, 'primaryGenre', coalesce(ge.name, ''),
  'status', e.status, 'desire', e.desire, 'store', coalesce(st.name, ''), 'platform', e.platform,
  'secondaryTags', g.tag_names, 'pace', g.pace, 'structure', g.structure,
  'actualHours', e.actual_hours, 'startedAt', e.started_at, 'finishedAt', e.finished_at,
  'rating', e.rating, 'notes', e.notes,
  'mainHours', g.main_hours, 'extraHours', g.extra_hours, 'completionistHours', g.completionist_hours,
  'size', g.size_label, 'timeVerification', g.time_verification, 'timeSource', g.time_source,
  'reviewNotes', g.review_notes, 'previousEstimatedHours', g.previous_estimated_hours,
  'coop', g.coop, 'mechanic', coalesce(me.name, ''), 'prerequisiteId', pre.code,
  'steamAppId', g.steam_app_id, 'steamHours', e.steam_hours,
  'steamUpdatedAt', ${isoTs('e.steam_updated_at')}, 'updatedAt', ${isoTs('e.updated_at')},
  'imported', '{"plannedHours":null,"affinity":null,"baseScore":null,"queueScore":null,"previousPendingId":null}'::jsonb || e.imported
)`;
const GAME_FROM = `library_entry e
  JOIN game g ON g.id = e.game_id
  LEFT JOIN genre ge ON ge.id = g.primary_genre_id
  LEFT JOIN mechanic me ON me.id = g.mechanic_id
  LEFT JOIN store st ON st.id = e.store_id
  LEFT JOIN game pre ON pre.id = g.prerequisite_game_id`;

type RawGame = Omit<Game, 'status' | 'desire'> & { status: string; desire: string };
const toGame = (raw: RawGame): Game => ({
  ...raw,
  status: statusLabel[raw.status],
  desire: desireLabel[raw.desire],
});

const normal = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
/** Tags sem vazias e sem duplicadas pela chave normalizada (mesma regra de norm_key). */
const cleanTags = (tags: string[]) => {
  const seen = new Map<string, string>();
  for (const t of tags) if (t.trim() && !seen.has(normal(t))) seen.set(normal(t), t.trim());
  return [...seen.values()];
};

/** Violações de CHECK/tamanho/faixa viram 400 em vez de 500. */
function asAppError(e: unknown): never {
  if (
    e instanceof postgres.PostgresError &&
    ['23514', '22001', '22003', '22007', '22008'].includes(e.code)
  )
    throw new AppError('Valor inválido');
  throw e;
}

export class PgGameRepository implements GameRepository {
  private sql: Sql;
  private user: AppUserResolver;
  constructor(sql: Sql, user: AppUserResolver) {
    this.sql = sql;
    this.user = user;
  }
  async list(): Promise<Game[]> {
    const sql = this.sql;
    const u = await this.user();
    const [row] = await sql<{ games: RawGame[] }[]>`
      SELECT coalesce(json_agg(${sql.unsafe(GAME_JSON)} ORDER BY e.id), '[]') AS games
        FROM ${sql.unsafe(GAME_FROM)}
       WHERE e.user_id = ${u}`;
    return row.games.map(toGame);
  }
  async get(id: string): Promise<Game | undefined> {
    const sql = this.sql;
    const u = await this.user();
    const [row] = await sql<{ game: RawGame }[]>`
      SELECT ${sql.unsafe(GAME_JSON)} AS game
        FROM ${sql.unsafe(GAME_FROM)}
       WHERE e.user_id = ${u} AND g.code = ${id}`;
    return row ? toGame(row.game) : undefined;
  }
  /**
   * Grava a edição numa ÚNICA instrução (um round trip, atômica): estado pessoal em
   * library_entry e campos de obra em game (catálogo global; só se o jogo estiver na
   * biblioteca do usuário e algo mudou de fato). Vocabulários novos (gênero, mecânica, loja,
   * tag) são criados sob demanda; o NOT EXISTS antes do INSERT evita consumir a identity
   * smallint a cada edição. Os triggers AFTER (tags → game → library_entry, invalidação da
   * fila) rodam no fim da instrução e veem o estado final.
   */
  async save(game: Game): Promise<void> {
    const sql = this.sql;
    const u = await this.user();
    const tags = sql.json(cleanTags(game.secondaryTags));
    const vocab = (table: string, value: string) => sql`
      ${sql(table + '_ins')} AS (
        INSERT INTO ${sql(table)} (name)
        SELECT x FROM (SELECT btrim(${value}::text) AS x) s
         WHERE x <> '' AND NOT EXISTS (SELECT 1 FROM ${sql(table)} WHERE key = norm_key(x))
        ON CONFLICT (key) DO NOTHING
        RETURNING id)`;
    const vocabId = (table: string, value: string) => sql`coalesce(
      (SELECT id FROM ${sql(table)} WHERE key = norm_key(${value}::text)),
      (SELECT id FROM ${sql(table + '_ins')}))`;
    try {
      await sql`
        WITH ${vocab('genre', game.primaryGenre)},
             ${vocab('mechanic', game.mechanic)},
             ${vocab('store', game.store)},
             tag_ins AS (
               INSERT INTO tag (name)
               SELECT DISTINCT btrim(x) FROM jsonb_array_elements_text(${tags}::jsonb) AS t(x)
                WHERE NOT EXISTS (SELECT 1 FROM tag WHERE key = norm_key(x))
               ON CONFLICT (key) DO NOTHING
               RETURNING id, key),
             tags AS (
               SELECT n.ord, coalesce(t.id, i.id) AS id
                 FROM jsonb_array_elements_text(${tags}::jsonb) WITH ORDINALITY AS n(x, ord)
                 LEFT JOIN tag t ON t.key = norm_key(n.x)
                 LEFT JOIN tag_ins i ON i.key = norm_key(n.x)),
             target AS (
               SELECT e.game_id AS id FROM library_entry e JOIN game g ON g.id = e.game_id
                WHERE e.user_id = ${u} AND g.code = ${game.id}),
             v AS (
               SELECT ${game.name}::text AS name,
                      ${vocabId('genre', game.primaryGenre)} AS primary_genre_id,
                      ${vocabId('mechanic', game.mechanic)} AS mechanic_id,
                      ${game.pace}::text AS pace, ${game.structure}::text AS structure,
                      ${game.coop}::text AS coop, ${game.size}::text AS size_label,
                      ${game.mainHours}::numeric AS main_hours, ${game.extraHours}::numeric AS extra_hours,
                      ${game.completionistHours}::numeric AS completionist_hours,
                      ${game.previousEstimatedHours}::numeric AS previous_estimated_hours,
                      ${game.timeVerification}::text AS time_verification,
                      ${game.timeSource}::text AS time_source, ${game.reviewNotes}::text AS review_notes,
                      (SELECT p.id FROM game p WHERE p.code = ${game.prerequisiteId}::text) AS prerequisite_game_id),
             upd_game AS (
               UPDATE game g
                  SET name = v.name, primary_genre_id = v.primary_genre_id, mechanic_id = v.mechanic_id,
                      pace = v.pace, structure = v.structure, coop = v.coop, size_label = v.size_label,
                      main_hours = v.main_hours, extra_hours = v.extra_hours,
                      completionist_hours = v.completionist_hours,
                      previous_estimated_hours = v.previous_estimated_hours,
                      time_verification = v.time_verification, time_source = v.time_source,
                      review_notes = v.review_notes, prerequisite_game_id = v.prerequisite_game_id
                 FROM v, target
                WHERE g.id = target.id
                  AND (g.name, g.primary_genre_id, g.mechanic_id, g.pace, g.structure, g.coop, g.size_label,
                       g.main_hours, g.extra_hours, g.completionist_hours, g.previous_estimated_hours,
                       g.time_verification, g.time_source, g.review_notes, g.prerequisite_game_id)
                      IS DISTINCT FROM
                      (v.name, v.primary_genre_id, v.mechanic_id, v.pace, v.structure, v.coop, v.size_label,
                       v.main_hours, v.extra_hours, v.completionist_hours, v.previous_estimated_hours,
                       v.time_verification, v.time_source, v.review_notes, v.prerequisite_game_id)
               RETURNING 1),
             upd_entry AS (
               UPDATE library_entry e
                  SET status = ${statusCode[game.status]}::game_status,
                      desire = ${desireCode[game.desire]}::desire_level,
                      store_id = ${vocabId('store', game.store)},
                      platform = ${game.platform}::text,
                      actual_hours = ${game.actualHours}::numeric,
                      started_at = ${game.startedAt}::date,
                      finished_at = ${game.finishedAt}::date,
                      rating = ${game.rating}::numeric,
                      notes = ${game.notes}::text
                 FROM target
                WHERE e.user_id = ${u} AND e.game_id = target.id
               RETURNING 1),
             -- tags: fonte da verdade = game_tag (triggers refazem game.tag_ids/tag_names)
             del_tags AS (
               DELETE FROM game_tag gt USING target
                WHERE gt.game_id = target.id
                  AND gt.tag_id NOT IN (SELECT id FROM tags WHERE id IS NOT NULL)
               RETURNING 1),
             ins_tags AS (
               INSERT INTO game_tag (game_id, tag_id, position)
               SELECT target.id, tags.id, tags.ord FROM target, tags WHERE tags.id IS NOT NULL
               ON CONFLICT (game_id, tag_id) DO UPDATE SET position = EXCLUDED.position
                WHERE game_tag.position IS DISTINCT FROM EXCLUDED.position
               RETURNING 1)
        SELECT (SELECT count(*) FROM upd_entry) AS updated`;
    } catch (e) {
      asAppError(e);
    }
  }
}

export class PgManualAdjustmentRepository implements ManualAdjustmentRepository {
  private sql: Sql;
  private user: AppUserResolver;
  constructor(sql: Sql, user: AppUserResolver) {
    this.sql = sql;
    this.user = user;
  }
  private async select(gameId?: string): Promise<ManualAdjustment[]> {
    const sql = this.sql;
    const u = await this.user();
    const rows = await sql<(Omit<ManualAdjustment, 'updatedAt'> & { updatedAt: Date })[]>`
      SELECT g.code AS "gameId", a.flat_points::float8 AS "manualPoints",
             a.manual_position AS "manualPosition", a.updated_at AS "updatedAt"
        FROM queue_manual_adjustment a JOIN game g ON g.id = a.game_id
       WHERE a.user_id = ${u} AND a.flat_points <> 0
             ${gameId ? sql`AND g.code = ${gameId}` : sql``}
       ORDER BY a.updated_at, g.code`;
    return rows.map((r) => ({ ...r, updatedAt: r.updatedAt.toISOString() }));
  }
  list() {
    return this.select();
  }
  async get(gameId: string) {
    return (await this.select(gameId))[0];
  }
  /**
   * Aplica o DELTA do movimento com apply_queue_move (atômica, FOR UPDATE, idempotente
   * por client_request_id = move.id). O total é a soma no banco, então dois movimentos
   * concorrentes de instâncias diferentes não se sobrescrevem.
   */
  async save(_adjustment: ManualAdjustment, move: ManualMove): Promise<void> {
    const u = await this.user();
    await this.sql`
      SELECT 1 FROM apply_queue_move(
        p_user_id       => ${u}::uuid,
        p_game_id       => (SELECT e.game_id FROM library_entry e JOIN game g ON g.id = e.game_id
                             WHERE e.user_id = ${u} AND g.code = ${move.gameId}),
        p_from_position => ${move.fromPosition}::int,
        p_to_position   => ${move.toPosition}::int,
        p_points_delta  => ${move.pointsDelta}::numeric,
        p_source        => 'api',
        p_request_id    => ${move.id}::uuid)`.catch(asAppError);
  }
  /** Reset: apaga o ajuste e audita, num statement só (equivalente a reset_queue_adjustments). */
  async remove(gameId: string, move: ManualMove): Promise<void> {
    if (move.kind === 'reorder') return this.save({} as ManualAdjustment, move);
    const u = await this.user();
    await this.sql`
      WITH d AS (
        DELETE FROM queue_manual_adjustment a USING game g
         WHERE a.user_id = ${u} AND a.game_id = g.id AND g.code = ${gameId}
        RETURNING a.game_id, a.flat_points)
      INSERT INTO queue_move_event (user_id, game_id, kind, from_position, to_position, points_delta,
                                    flat_points_before, flat_points_after, source, client_request_id)
      SELECT ${u}, d.game_id, 'reset', ${move.fromPosition}::int, ${move.toPosition}::int,
             -d.flat_points, d.flat_points, 0, 'api', ${move.id}::uuid
        FROM d WHERE d.flat_points <> 0`;
  }
  /** Últimos 500 movimentos, em ordem cronológica. */
  async moves(gameId?: string): Promise<ManualMove[]> {
    const sql = this.sql;
    const u = await this.user();
    const rows = await sql<(Omit<ManualMove, 'createdAt'> & { createdAt: Date })[]>`
      SELECT id, "gameId", kind, "fromPosition", "toPosition", "effectivePosition",
             "pointsDelta", "manualPointsAfter", "createdAt"
        FROM (SELECT coalesce(m.client_request_id::text, m.id::text) AS id, g.code AS "gameId",
                     CASE m.kind WHEN 'reset' THEN 'reset' ELSE 'reorder' END AS kind,
                     m.from_position AS "fromPosition", m.to_position AS "toPosition",
                     NULL::int AS "effectivePosition",
                     m.points_delta::float8 AS "pointsDelta",
                     m.flat_points_after::float8 AS "manualPointsAfter",
                     m.created_at AS "createdAt", m.id AS seq
                FROM queue_move_event m JOIN game g ON g.id = m.game_id
               WHERE m.user_id = ${u} ${gameId ? sql`AND g.code = ${gameId}` : sql``}
               ORDER BY m.created_at DESC, m.id DESC
               LIMIT 500) x
       ORDER BY "createdAt", seq`;
    return rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }));
  }
}

/**
 * Snapshot da fila (queue_snapshot + queue_snapshot_item) com frescor por
 * user_queue_state.inputs_version, mantido por triggers (ver db/README.md).
 */
export class PgQueueSnapshotStore implements QueueSnapshotStore {
  private sql: Sql;
  private user: AppUserResolver;
  constructor(sql: Sql, user: AppUserResolver) {
    this.sql = sql;
    this.user = user;
  }
  /**
   * Um statement = um snapshot MVCC: a versão, os jogos, os ajustes e o snapshot (só se
   * fresco) são lidos de forma consistente, num único round trip.
   */
  async load(): Promise<QueueInputs> {
    const sql = this.sql;
    const u = await this.user();
    const [row] = await sql<
      {
        version: string;
        games: RawGame[];
        manual: Record<string, number>;
        snapshot: StoredQueue | null;
      }[]
    >`
      WITH v AS (
        SELECT coalesce((SELECT inputs_version FROM user_queue_state WHERE user_id = ${u}), 1) AS version)
      SELECT v.version::text AS version,
             (SELECT coalesce(json_agg(${sql.unsafe(GAME_JSON)} ORDER BY e.id), '[]')
                FROM ${sql.unsafe(GAME_FROM)} WHERE e.user_id = ${u}) AS games,
             (SELECT coalesce(json_object_agg(g.code, a.flat_points), '{}')
                FROM queue_manual_adjustment a JOIN game g ON g.id = a.game_id
               WHERE a.user_id = ${u} AND a.flat_points <> 0) AS manual,
             (SELECT json_build_object(
                       'total', s.total, 'estimatedHours', s.estimated_hours,
                       'timeFactor', s.time_factor, 'weights', s.weights, 'excluded', s.excluded,
                       'items', (SELECT coalesce(json_agg(json_build_object(
                                   'gameId', g.code, 'position', i.position, 'score', i.score,
                                   'manualPoints', i.manual_points, 'cumulativeHours', i.cumulative_hours,
                                   'reasons', i.reasons, 'adjustments', i.adjustments) ORDER BY i.position), '[]')
                                   FROM queue_snapshot_item i JOIN game g ON g.id = i.game_id
                                  WHERE i.user_id = ${u}))
                FROM queue_snapshot s
               WHERE s.user_id = ${u} AND s.inputs_version = v.version
                 AND s.algorithm_version = ${ALGORITHM_VERSION}) AS snapshot
        FROM v`;
    return {
      version: row.version,
      games: row.games.map(toGame),
      manual: row.manual,
      snapshot: row.snapshot,
    };
  }
  /**
   * Regrava o snapshot calculado a partir das entradas de `version`, numa única instrução
   * (cabeçalho + troca dos itens; o INSERT depende do DELETE, que roda antes). Se as
   * entradas mudaram no meio tempo, o snapshot nasce velho (inputs_version menor) e será
   * recalculado — nunca servido errado. É um cache: se outra requisição gravar o mesmo
   * usuário ao mesmo tempo (conflito de chave/deadlock), esta gravação é descartada.
   */
  async save(version: string, queue: Recommendations): Promise<void> {
    const sql = this.sql;
    const u = await this.user();
    const round2 = (n: number) => Math.round(n * 100) / 100;
    const items = json(
      queue.items.map((i) => ({
        code: i.game.id,
        position: i.position,
        algorithm_score: round2(i.score - i.manualPoints),
        manual_points: i.manualPoints,
        score: i.score,
        cumulative_hours: i.cumulativeHours,
        planned_hours: i.game.plannedHours,
        base_score: i.game.baseScore,
        affinity: i.game.affinity,
        reasons: i.reasons,
        adjustments: i.adjustments,
      })),
    );
    try {
      await sql`
        WITH hdr AS (
               INSERT INTO queue_snapshot (user_id, inputs_version, algorithm_version, computed_at,
                                           time_factor, total, estimated_hours, weights, excluded)
               VALUES (${u}, ${version}::bigint, ${ALGORITHM_VERSION}, now(), ${queue.timeFactor}::numeric,
                       ${queue.total}::int, ${queue.estimatedHours}::numeric,
                       ${sql.json(json(queue.weights))}::jsonb, ${sql.json(json(queue.excluded))}::jsonb)
               ON CONFLICT (user_id) DO UPDATE SET
                 inputs_version = EXCLUDED.inputs_version, algorithm_version = EXCLUDED.algorithm_version,
                 computed_at = EXCLUDED.computed_at, time_factor = EXCLUDED.time_factor,
                 total = EXCLUDED.total, estimated_hours = EXCLUDED.estimated_hours,
                 weights = EXCLUDED.weights, excluded = EXCLUDED.excluded
               RETURNING 1),
             del AS (DELETE FROM queue_snapshot_item WHERE user_id = ${u} RETURNING 1)
        INSERT INTO queue_snapshot_item (user_id, position, game_id, library_entry_id, algorithm_score,
                                         manual_points, score, cumulative_hours, planned_hours,
                                         base_score, affinity, reasons, adjustments)
        SELECT ${u}, x.position, e.game_id, e.id, x.algorithm_score, x.manual_points, x.score,
               x.cumulative_hours, x.planned_hours, x.base_score, x.affinity, x.reasons, x.adjustments
          FROM jsonb_to_recordset(${sql.json(items)}::jsonb) AS x(
                 code text, position int, algorithm_score numeric, manual_points numeric,
                 score numeric, cumulative_hours numeric, planned_hours numeric,
                 base_score numeric, affinity numeric, reasons text[], adjustments jsonb)
          JOIN game g ON g.code = x.code
          JOIN library_entry e ON e.user_id = ${u} AND e.game_id = g.id
         WHERE (SELECT count(*) FROM del) >= 0 AND (SELECT count(*) FROM hdr) = 1`;
    } catch (e) {
      if (e instanceof postgres.PostgresError && ['23505', '23503', '40P01'].includes(e.code))
        return;
      throw e;
    }
  }
}
