// Postgres: jogos da biblioteca do usuário (library_entry + game + vocabulários).
// A API conecta direto (DATABASE_URL): a RLS NÃO se aplica, então toda query filtra por
// library_entry.user_id = owner. Toda operação é UMA instrução SQL (atômica por si, sem
// BEGIN/COMMIT): com `prepare: false` cada query parametrizada custa 2 round trips, e
// transações explícitas somariam mais 2; por isso evitamos múltiplos statements.
import type { Game, GameStatus } from '../../../../../../packages/core/src/models.ts';
import type { MetadataCatalog } from '../../../../../../packages/core/src/metadata.ts';
import { normalizeMetadata } from '../../../../../../packages/core/src/metadata.ts';
import type { Sql } from '../../db.ts';
import type { GamesDriver, GameBrowseQuery, GameBrowseResult } from '../types.ts';
import {
  desireCode,
  gameFrom,
  gameJson,
  pgError,
  statusCode,
  toGame,
  type RawGame,
} from './shared.ts';

/** Tags sem vazias e sem duplicadas pela chave normalizada (mesma regra de norm_key). */
const cleanTags = (tags: string[]) => {
  const seen = new Map<string, string>();
  for (const t of tags)
    if (t.trim() && !seen.has(normalizeMetadata(t))) seen.set(normalizeMetadata(t), t.trim());
  return [...seen.values()];
};

/** Vocabulários controlados que `save` resolve por chave (lista fixa; nunca vem de entrada). */
type Vocabulary = 'genre' | 'mechanic' | 'store';

export class PgGamesDriver implements GamesDriver {
  private sql: Sql;
  constructor(sql: Sql) {
    this.sql = sql;
  }
  async list(owner: string): Promise<Game[]> {
    const sql = this.sql;
    const [row] = await sql<{ games: RawGame[] }[]>`
      SELECT coalesce(json_agg(${gameJson(sql)} ORDER BY e.id), '[]') AS games
        FROM ${gameFrom(sql)}
       WHERE e.user_id = ${owner}`;
    return row.games.map(toGame);
  }
  async browse(owner: string, query: GameBrowseQuery): Promise<GameBrowseResult> {
    const sql = this.sql;
    const page = Math.max(1, query.page);
    const pageSize = Math.max(1, query.pageSize);
    const offset = (page - 1) * pageSize;

    const qPattern = query.q ? '%' + query.q.replace(/[\\%_]/g, '\\$&') + '%' : null;
    const dbStatus = query.status ? (statusCode[query.status as GameStatus] ?? query.status) : null;
    const statusValid = dbStatus ? Object.values(statusCode).includes(dbStatus) : false;

    const orderClause =
      query.sort === 'desire'
        ? sql`ORDER BY rd.sort_order, lower(g.name)`
        : sql`ORDER BY lower(g.name), g.code`;

    try {
      const rows = await sql<{ game: RawGame; full_count: number }[]>`
        SELECT ${gameJson(sql)} AS game,
               count(*) OVER()::int AS full_count
          FROM ${gameFrom(sql)}
          LEFT JOIN ref_desire rd ON rd.code = e.desire
         WHERE e.user_id = ${owner}
           ${qPattern ? sql`AND norm_key(g.name || ' ' || array_to_string(g.tag_names, ' ')) LIKE norm_key(${qPattern}) ESCAPE '\\'` : sql``}
           ${query.status ? (statusValid ? sql`AND e.status = ${dbStatus}::game_status` : sql`AND 1 = 0`) : sql``}
           ${query.primaryGenre ? sql`AND ge.name = ${query.primaryGenre}` : sql``}
           ${query.store ? sql`AND st.name = ${query.store}` : sql``}
         ${orderClause}
         LIMIT ${pageSize} OFFSET ${offset}`;

      let total = rows[0]?.full_count ?? 0;
      if (rows.length === 0 && offset > 0) {
        const [c] = await sql<{ count: number }[]>`
          SELECT count(*)::int AS count
            FROM ${gameFrom(sql)}
           WHERE e.user_id = ${owner}
             ${qPattern ? sql`AND norm_key(g.name || ' ' || array_to_string(g.tag_names, ' ')) LIKE norm_key(${qPattern}) ESCAPE '\\'` : sql``}
             ${query.status ? (statusValid ? sql`AND e.status = ${dbStatus}::game_status` : sql`AND 1 = 0`) : sql``}
             ${query.primaryGenre ? sql`AND ge.name = ${query.primaryGenre}` : sql``}
             ${query.store ? sql`AND st.name = ${query.store}` : sql``}`;
        total = c?.count ?? 0;
      }

      return {
        items: rows.map((r) => toGame(r.game)),
        total,
      };
    } catch (e) {
      pgError(e);
    }
  }
  /** Search only the owner's library; treat wildcard characters literally. */
  async searchByName(owner: string, query: string, excludeId?: string): Promise<Game[]> {
    const sql = this.sql;
    const pattern = '%' + query.replace(/[\\%_]/g, '\\$&') + '%';
    const rows = await sql<{ game: RawGame }[]>`
      SELECT ${gameJson(sql)} AS game
        FROM ${gameFrom(sql)}
       WHERE e.user_id = ${owner}
         AND norm_key(g.name) LIKE norm_key(${pattern}) ESCAPE '\\'
         AND (${excludeId ?? null}::text IS NULL OR g.code <> ${excludeId ?? null}::text)
       ORDER BY lower(g.name), g.code
       LIMIT 12`;
    return rows.map((r) => toGame(r.game));
  }
  async get(owner: string, id: string): Promise<Game | undefined> {
    const sql = this.sql;
    const [row] = await sql<{ game: RawGame }[]>`
      SELECT ${gameJson(sql)} AS game
        FROM ${gameFrom(sql)}
       WHERE e.user_id = ${owner} AND g.code = ${id}`;
    return row ? toGame(row.game) : undefined;
  }
  async catalog(): Promise<MetadataCatalog> {
    const [row] = await this.sql<{ catalog: MetadataCatalog }[]>`
      SELECT json_build_object(
        'genres', (SELECT coalesce(json_agg(name ORDER BY name), '[]') FROM genre),
        'tags', (SELECT coalesce(json_agg(name ORDER BY name), '[]') FROM tag),
        'mechanics', (SELECT coalesce(json_agg(name ORDER BY name), '[]') FROM mechanic),
        'stores', (SELECT coalesce(json_agg(name ORDER BY name), '[]') FROM store),
        'paces', (SELECT coalesce(json_agg(name ORDER BY sort_order, name), '[]') FROM ref_pace WHERE name <> ''),
        'structures', (SELECT coalesce(json_agg(name ORDER BY sort_order, name), '[]') FROM ref_structure WHERE name <> ''),
        'platforms', (SELECT coalesce(json_agg(name ORDER BY sort_order, name), '[]') FROM ref_platform WHERE name <> '')
      ) AS catalog`;
    return row.catalog;
  }
  /**
   * Grava a edição numa ÚNICA instrução (um round trip, atômica): estado pessoal em
   * library_entry e campos de obra em game (catálogo global; só se o jogo estiver na
   * biblioteca do usuário e algo mudou de fato). Vocabulários novos (gênero, mecânica, loja,
   * tag) são criados sob demanda; o NOT EXISTS antes do INSERT evita consumir a identity
   * smallint a cada edição. Os triggers AFTER (tags → game → library_entry, invalidação da
   * fila) rodam no fim da instrução e veem o estado final.
   */
  async save(owner: string, game: Game, { writeCatalog }: { writeCatalog: boolean }) {
    const sql = this.sql;
    const tags = sql.json(cleanTags(game.secondaryTags));
    // `game` and `game_tag` are shared by every library: the caller says who may write them.
    const canCatalog = writeCatalog;
    const vocabId = (table: Vocabulary, value: string) => sql`
      (SELECT id FROM ${sql(table)} WHERE key = norm_key(${value}::text))`;
    try {
      await sql`
        WITH tags AS (
               SELECT n.ord, t.id
                 FROM jsonb_array_elements_text(${tags}::jsonb) WITH ORDINALITY AS n(x, ord)
                 LEFT JOIN tag t ON t.key = norm_key(n.x)),
             target AS (
               SELECT e.game_id AS id FROM library_entry e JOIN game g ON g.id = e.game_id
                WHERE e.user_id = ${owner} AND g.code = ${game.id}),
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
                  AND ${canCatalog}::boolean
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
                      purchased_at = coalesce(e.purchased_at, ${game.purchasedAt ?? null}::timestamptz),
                      started_at = ${game.startedAt}::date,
                      finished_at = ${game.finishedAt}::date,
                      rating = ${game.rating}::numeric,
                      notes = ${game.notes}::text
                 FROM target
                WHERE e.user_id = ${owner} AND e.game_id = target.id
               RETURNING 1),
             -- tags: fonte da verdade = game_tag (triggers refazem game.tag_ids/tag_names)
             del_tags AS (
               DELETE FROM game_tag gt USING target
                WHERE gt.game_id = target.id
                  AND ${canCatalog}::boolean
                  AND gt.tag_id NOT IN (SELECT id FROM tags WHERE id IS NOT NULL)
               RETURNING 1),
             ins_tags AS (
               INSERT INTO game_tag (game_id, tag_id, position)
               SELECT target.id, tags.id, tags.ord FROM target, tags
                WHERE tags.id IS NOT NULL AND ${canCatalog}::boolean
               ON CONFLICT (game_id, tag_id) DO UPDATE SET position = EXCLUDED.position
                WHERE game_tag.position IS DISTINCT FROM EXCLUDED.position
               RETURNING 1)
        SELECT (SELECT count(*) FROM upd_entry) AS updated`;
    } catch (e) {
      pgError(e);
    }
  }
}
