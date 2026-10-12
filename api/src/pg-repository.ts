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
  GameList,
  GameStatus,
  ManualAdjustment,
  ManualMove,
  ScoringConfig,
} from '../../shared/models.ts';
import postgres from 'postgres';
import type { Sql } from './db.ts';
/** Valor serializado como json pelo driver (sql.json). */
const json = (v: unknown) => v as postgres.JSONValue;
import type { AppUserResolver } from './app-user.ts';
import type { GameRepository, QueueInputs, QueueInputsReader } from './repository.ts';
import type { ManualAdjustmentRepository } from './manual-repository.ts';
import { DEFAULT_LIST_NAME, duplicateListName, type ListRepository } from './list-repository.ts';
import type { ManualPin } from './scoring.ts';
import { AppError } from './service.ts';
import { storedScoringConfig } from './scoring-config.ts';
import type { ScoringConfigRepository, StoredScoringConfig } from './settings-repository.ts';

const statusCode: Record<GameStatus, string> = {
  'Não iniciado': 'not_started',
  Jogando: 'playing',
  Abandonado: 'abandoned',
  Finalizado: 'finished',
  Desejado: 'wishlist',
};
const desireCode: Record<Desire, string> = {
  Imediata: 'immediate',
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
  // FK: lista/jogo inexistente ou de outro usuário (ex.: (user_id, list_id) → game_list).
  if (e instanceof postgres.PostgresError && e.code === '23503')
    throw new AppError('Registro não encontrado', 404);
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

/** Recência dos pins: o mais recente por último (vence empates em recommendGames). */
const PIN_ORDER = 'coalesce(a.last_moved_at, a.updated_at), g.code';

export class PgManualAdjustmentRepository implements ManualAdjustmentRepository {
  private sql: Sql;
  private user: AppUserResolver;
  constructor(sql: Sql, user: AppUserResolver) {
    this.sql = sql;
    this.user = user;
  }
  /** Pins da lista (manual_position preenchida), do movido há mais tempo ao mais recente. */
  async list(listId: string): Promise<ManualAdjustment[]> {
    const u = await this.user();
    const rows = await this.sql<(Omit<ManualAdjustment, 'updatedAt'> & { updatedAt: Date })[]>`
      SELECT g.code AS "gameId", a.manual_position AS "manualPosition",
             coalesce(a.last_moved_at, a.updated_at) AS "updatedAt"
        FROM queue_manual_adjustment a JOIN game g ON g.id = a.game_id
       WHERE a.list_id = ${listId} AND a.user_id = ${u} AND a.manual_position IS NOT NULL
       ORDER BY ${this.sql.unsafe(PIN_ORDER)}`;
    return rows.map((r) => ({ ...r, updatedAt: r.updatedAt.toISOString() }));
  }
  /**
   * Um statement: registra o movimento (ON CONFLICT no client_request_id = move.id) e só
   * se ele for novo grava os pins. Retentativa de uma gravação que já entrou é no-op.
   * Só o jogo movido ganha recência (last_moved_at); os outros só corrigem o índice.
   * A FK (user_id, list_id) garante que a lista é do usuário.
   */
  async pin(
    listId: string,
    pins: { gameId: string; position: number }[],
    move: ManualMove,
  ): Promise<void> {
    const u = await this.user();
    const codes = pins.map((p) => p.gameId),
      positions = pins.map((p) => p.position);
    await this.sql`
      WITH ev AS (
        INSERT INTO queue_move_event (user_id, list_id, game_id, kind, from_position, to_position, points_delta,
                                      flat_points_before, flat_points_after, source, client_request_id)
        SELECT ${u}, ${listId}::uuid, e.game_id, 'move', ${move.fromPosition}::int,
               ${move.toPosition}::int, 0, 0, 0, 'drag', ${move.id}::uuid
          FROM library_entry e JOIN game g ON g.id = e.game_id
         WHERE e.user_id = ${u} AND g.code = ${move.gameId}
        ON CONFLICT (user_id, client_request_id) WHERE client_request_id IS NOT NULL DO NOTHING
        RETURNING 1)
      INSERT INTO queue_manual_adjustment AS a
             (user_id, list_id, game_id, flat_points, manual_position, previous_position, move_count,
              last_moved_at)
      SELECT ${u}, ${listId}::uuid, e.game_id, 0, p.pos,
             CASE WHEN g.code = ${move.gameId} THEN ${move.fromPosition}::int END,
             (g.code = ${move.gameId})::int, now()
        FROM unnest(${codes}::text[], ${positions}::int[]) AS p(code, pos)
        JOIN game g ON g.code = p.code
        JOIN library_entry e ON e.game_id = g.id AND e.user_id = ${u}
       WHERE EXISTS (SELECT 1 FROM ev)
      ON CONFLICT (list_id, game_id) DO UPDATE
         SET manual_position   = EXCLUDED.manual_position,
             flat_points       = 0,
             previous_position = coalesce(EXCLUDED.previous_position, a.previous_position),
             move_count        = a.move_count + EXCLUDED.move_count,
             last_moved_at     = CASE WHEN EXCLUDED.move_count > 0 THEN now()
                                      ELSE coalesce(a.last_moved_at, a.updated_at) END`.catch(
      asAppError,
    );
  }
  /** Reset: apaga o pin da lista e audita, num statement só. */
  async remove(listId: string, gameId: string, move: ManualMove): Promise<boolean> {
    const u = await this.user();
    const rows = await this.sql`
      WITH d AS (
        DELETE FROM queue_manual_adjustment a USING game g
         WHERE a.list_id = ${listId} AND a.user_id = ${u} AND a.game_id = g.id AND g.code = ${gameId}
        RETURNING a.game_id, a.manual_position)
      INSERT INTO queue_move_event (user_id, list_id, game_id, kind, from_position, to_position,
                                    points_delta, flat_points_before, flat_points_after, source,
                                    client_request_id)
      SELECT ${u}, ${listId}::uuid, d.game_id, 'reset', ${move.fromPosition}::int, NULL, 0, 0, 0,
             'api', ${move.id}::uuid
        FROM d WHERE d.manual_position IS NOT NULL
      RETURNING 1`;
    return rows.length > 0;
  }
  /** Últimos 500 movimentos da lista, em ordem cronológica. */
  async moves(listId: string, gameId?: string): Promise<ManualMove[]> {
    const sql = this.sql;
    const u = await this.user();
    const rows = await sql<(Omit<ManualMove, 'createdAt'> & { createdAt: Date })[]>`
      SELECT id, "gameId", kind, "fromPosition", "toPosition", "createdAt"
        FROM (SELECT coalesce(m.client_request_id::text, m.id::text) AS id, g.code AS "gameId",
                     CASE m.kind WHEN 'reset' THEN 'reset' ELSE 'reorder' END AS kind,
                     m.from_position AS "fromPosition", m.to_position AS "toPosition",
                     m.created_at AS "createdAt", m.id AS seq
                FROM queue_move_event m JOIN game g ON g.id = m.game_id
               WHERE m.list_id = ${listId} AND m.user_id = ${u}
                     ${gameId ? sql`AND g.code = ${gameId}` : sql``}
               ORDER BY m.created_at DESC, m.id DESC
               LIMIT 500) x
       ORDER BY "createdAt", seq`;
    return rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }));
  }
}

/** Linha de user_score_weights (uma por lista) como json (sem linha = config padrão, versão 0). */
const SETTINGS_JSON = `SELECT json_build_object('weights', w.weights, 'rules', w.rules, 'filters', w.filters,
  'version', w.version, 'updatedAt', ${isoTs('w.updated_at')}) FROM user_score_weights w`;
interface RawSettings {
  weights: unknown;
  rules: unknown;
  filters: unknown;
  version: number;
  updatedAt: string;
}
const toSettings = (raw: RawSettings | null | undefined): StoredScoringConfig => ({
  config: storedScoringConfig(raw?.weights, raw?.rules, raw?.filters),
  version: raw?.version ?? 0,
  updatedAt: raw?.updatedAt ?? null,
});

/** Pesos + regras de cada lista em user_score_weights (chave list_id). */
export class PgScoringConfigRepository implements ScoringConfigRepository {
  private sql: Sql;
  private user: AppUserResolver;
  constructor(sql: Sql, user: AppUserResolver) {
    this.sql = sql;
    this.user = user;
  }
  async get(listId: string): Promise<StoredScoringConfig> {
    const sql = this.sql;
    const u = await this.user();
    const [row] = await sql<{ settings: RawSettings | null }[]>`
      SELECT (${sql.unsafe(SETTINGS_JSON)} WHERE w.list_id = ${listId} AND w.user_id = ${u}) AS settings`;
    return toSettings(row?.settings);
  }
  /**
   * Upsert numa instrução; `version` sobe atomicamente. A FK (user_id, list_id) → game_list
   * impede gravar na lista de outro usuário (vira 404).
   */
  async save(listId: string, config: ScoringConfig): Promise<StoredScoringConfig> {
    const sql = this.sql;
    const u = await this.user();
    const [row] = await sql<{ settings: RawSettings }[]>`
      INSERT INTO user_score_weights AS w (list_id, user_id, weights, rules, filters)
      VALUES (${listId}, ${u}, ${sql.json(json(config.weights))}::jsonb,
              ${sql.json(json(config.rules))}::jsonb, ${sql.json(json(config.filters))}::jsonb)
      ON CONFLICT (list_id) DO UPDATE
         SET weights = EXCLUDED.weights, rules = EXCLUDED.rules, filters = EXCLUDED.filters,
             version = w.version + 1
       WHERE w.user_id = EXCLUDED.user_id
      RETURNING json_build_object('weights', w.weights, 'rules', w.rules, 'filters', w.filters,
                'version', w.version, 'updatedAt', ${sql.unsafe(isoTs('w.updated_at'))}) AS settings`.catch(
      asAppError,
    );
    if (!row) throw new AppError('Lista não encontrada', 404);
    return toSettings(row.settings);
  }
}

type RawList = Omit<GameList, 'createdAt'> & { createdAt: Date };
const toList = (r: RawList): GameList => ({ ...r, createdAt: r.createdAt.toISOString() });
const LIST_JSON = `json_build_object('id', l.id, 'name', l.name, 'createdAt', ${isoTs('l.created_at')})`;

/**
 * Jogos, lista, ajustes manuais da lista e config da lista numa única consulta
 * (um round trip, leitura consistente). Sem `listId`, usa a lista mais antiga do usuário.
 */
export class PgQueueInputsReader implements QueueInputsReader {
  private sql: Sql;
  private user: AppUserResolver;
  constructor(sql: Sql, user: AppUserResolver) {
    this.sql = sql;
    this.user = user;
  }
  async load(listId?: string): Promise<QueueInputs | null> {
    const sql = this.sql;
    const u = await this.user();
    const [row] = await sql<
      {
        list: GameList | null;
        games: RawGame[];
        pins: ManualPin[];
        settings: RawSettings | null;
      }[]
    >`
      WITH l AS (
        SELECT l.id, l.name, l.created_at FROM game_list l
         WHERE l.user_id = ${u} AND (${listId ?? null}::uuid IS NULL OR l.id = ${listId ?? null}::uuid)
         ORDER BY l.created_at, l.id LIMIT 1)
      SELECT (SELECT ${sql.unsafe(LIST_JSON)} FROM l) AS list,
             (SELECT coalesce(json_agg(${sql.unsafe(GAME_JSON)} ORDER BY e.id), '[]')
                FROM ${sql.unsafe(GAME_FROM)} WHERE e.user_id = ${u}) AS games,
             (SELECT coalesce(json_agg(json_build_object('gameId', g.code, 'position', a.manual_position)
                                       ORDER BY ${sql.unsafe(PIN_ORDER)}), '[]')
                FROM queue_manual_adjustment a JOIN game g ON g.id = a.game_id
               WHERE a.list_id = (SELECT id FROM l) AND a.manual_position IS NOT NULL) AS pins,
             (${sql.unsafe(SETTINGS_JSON)} WHERE w.list_id = (SELECT id FROM l)) AS settings`;
    if (!row.list) return null;
    return {
      list: row.list,
      games: row.games.map(toGame),
      pins: row.pins,
      settings: toSettings(row.settings),
    };
  }
}

/** Listas do usuário em game_list. */
export class PgListRepository implements ListRepository {
  private sql: Sql;
  private user: AppUserResolver;
  constructor(sql: Sql, user: AppUserResolver) {
    this.sql = sql;
    this.user = user;
  }
  /**
   * Todas as listas, mais antiga primeiro. Se o usuário não tiver nenhuma, cria a padrão na
   * mesma instrução (o CTE de INSERT não é visível no SELECT da tabela, daí o UNION ALL).
   */
  async list(): Promise<GameList[]> {
    const u = await this.user();
    const rows = await this.sql<RawList[]>`
      WITH ins AS (
        INSERT INTO game_list (user_id, name)
        SELECT ${u}, ${DEFAULT_LIST_NAME}
         WHERE NOT EXISTS (SELECT 1 FROM game_list WHERE user_id = ${u})
        ON CONFLICT DO NOTHING
        RETURNING id, name, created_at)
      SELECT id, name, created_at AS "createdAt" FROM ins
      UNION ALL
      SELECT id, name, created_at FROM game_list WHERE user_id = ${u}
      ORDER BY "createdAt", id`;
    return rows.map(toList);
  }
  async get(id: string): Promise<GameList | undefined> {
    const u = await this.user();
    const [row] = await this.sql<RawList[]>`
      SELECT id, name, created_at AS "createdAt" FROM game_list WHERE id = ${id} AND user_id = ${u}`;
    return row && toList(row);
  }
  async create(name: string): Promise<GameList> {
    const u = await this.user();
    const [row] = await this.sql<RawList[]>`
      INSERT INTO game_list (user_id, name) VALUES (${u}, ${name})
      RETURNING id, name, created_at AS "createdAt"`.catch(listError);
    return toList(row);
  }
  async rename(id: string, name: string): Promise<GameList | undefined> {
    const u = await this.user();
    const [row] = await this.sql<RawList[]>`
      UPDATE game_list SET name = ${name} WHERE id = ${id} AND user_id = ${u}
      RETURNING id, name, created_at AS "createdAt"`.catch(listError);
    return row && toList(row);
  }
  /**
   * Apaga a lista (cascata: config, ajustes e histórico dela) se não for a única.
   * Duas exclusões simultâneas das duas últimas listas poderiam passar juntas; o caso é
   * inofensivo (a próxima leitura recria a padrão).
   */
  async remove(id: string): Promise<'removed' | 'missing' | 'last'> {
    const u = await this.user();
    const [row] = await this.sql<{ found: boolean; deleted: boolean }[]>`
      WITH target AS (SELECT id FROM game_list WHERE id = ${id} AND user_id = ${u}),
           d AS (
             DELETE FROM game_list
              WHERE id IN (SELECT id FROM target)
                AND (SELECT count(*) FROM game_list WHERE user_id = ${u}) > 1
             RETURNING id)
      SELECT EXISTS (SELECT 1 FROM target) AS found, EXISTS (SELECT 1 FROM d) AS deleted`;
    return !row.found ? 'missing' : row.deleted ? 'removed' : 'last';
  }
}

/** Nome repetido (índice único user_id + lower(name)) → 409; CHECK → 400. */
function listError(e: unknown): never {
  if (e instanceof postgres.PostgresError && e.code === '23505') throw duplicateListName();
  return asAppError(e);
}
