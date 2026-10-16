// Pieces shared by the Postgres drivers: vocabulary maps, row shapes and SQL fragments.
// Fragments are built from tagged templates only; nothing here concatenates SQL text.
import postgres from 'postgres';
import { Desire, type Game, GameStatus } from '../../../../../../packages/core/src/models.ts';
import type { Sql } from '../../db.ts';
import { DataError } from '../types.ts';

type Fragment = postgres.PendingQuery<postgres.Row[]>;

/** Valor serializado como json pelo driver (sql.json). */
export const json = (v: unknown) => v as postgres.JSONValue;

export const statusCode: Record<GameStatus, string> = {
  [GameStatus.NotStarted]: 'not_started',
  [GameStatus.Playing]: 'playing',
  [GameStatus.Abandoned]: 'abandoned',
  [GameStatus.Finished]: 'finished',
  [GameStatus.Wishlist]: 'wishlist',
};
export const desireCode: Record<Desire, string> = {
  [Desire.Immediate]: 'immediate',
  [Desire.VeryHigh]: 'very_high',
  [Desire.High]: 'high',
  [Desire.Medium]: 'medium',
  [Desire.Low]: 'low',
  [Desire.VeryLow]: 'very_low',
};
const invert = <K extends string>(m: Record<K, string>) =>
  Object.fromEntries(Object.entries(m).map(([k, v]) => [v, k])) as Record<string, K>;
const statusLabel = invert(statusCode);
const desireLabel = invert(desireCode);

/** A timestamp column as an ISO-8601 UTC string. */
export const isoTs = (sql: Sql, col: Fragment): Fragment =>
  sql`to_char(${col} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;

/** Uma linha de library_entry (+ game e vocabulários) no formato de `Game`. */
export const gameJson = (sql: Sql): Fragment => sql`json_build_object(
  'id', g.code, 'name', g.name, 'primaryGenre', coalesce(ge.name, ''),
  'status', e.status, 'desire', e.desire, 'store', coalesce(st.name, ''), 'platform', e.platform,
  'secondaryTags', g.tag_names, 'pace', g.pace, 'structure', g.structure,
  'actualHours', e.actual_hours, 'startedAt', e.started_at, 'finishedAt', e.finished_at,
  'rating', e.rating, 'notes', e.notes, 'purchasedAt', ${isoTs(sql, sql`e.purchased_at`)},
  'mainHours', g.main_hours, 'extraHours', g.extra_hours, 'completionistHours', g.completionist_hours,
  'size', g.size_label, 'timeVerification', g.time_verification, 'timeSource', g.time_source,
  'reviewNotes', g.review_notes, 'previousEstimatedHours', g.previous_estimated_hours,
  'coop', g.coop, 'mechanic', coalesce(me.name, ''), 'prerequisiteId', pre.code,
  'steamAppId', g.steam_app_id, 'steamHours', e.steam_hours,
  'steamUpdatedAt', ${isoTs(sql, sql`e.steam_updated_at`)}, 'updatedAt', ${isoTs(sql, sql`e.updated_at`)},
  'coverUrl', g.card_cover_url,
  'imported', '{"plannedHours":null,"affinity":null,"baseScore":null,"queueScore":null,"previousPendingId":null}'::jsonb || e.imported
)`;
export const gameFrom = (sql: Sql): Fragment => sql`library_entry e
  JOIN game g ON g.id = e.game_id
  LEFT JOIN genre ge ON ge.id = g.primary_genre_id
  LEFT JOIN mechanic me ON me.id = g.mechanic_id
  LEFT JOIN store st ON st.id = e.store_id
  LEFT JOIN game pre ON pre.id = g.prerequisite_game_id`;

export type RawGame = Omit<Game, 'status' | 'desire'> & { status: string; desire: string };
export const toGame = (raw: RawGame): Game => ({
  ...raw,
  status: statusLabel[raw.status],
  desire: desireLabel[raw.desire],
});

/** Recência dos pins: o mais recente por último (vence empates em recommendGames). */
export const pinOrder = (sql: Sql): Fragment =>
  sql`coalesce(a.last_moved_at, a.updated_at), g.code`;

/** Linha de user_score_weights (uma por lista) como json. */
export const settingsJson = (sql: Sql): Fragment =>
  sql`SELECT json_build_object('weights', w.weights, 'rules', w.rules, 'filters', w.filters,
  'version', w.version, 'updatedAt', ${isoTs(sql, sql`w.updated_at`)}) FROM user_score_weights w`;

/** Violações de CHECK/tamanho/faixa/FK/unicidade viram DataError neutro; o resto passa. */
export function pgError(e: unknown): never {
  if (e instanceof postgres.PostgresError) {
    if (['23514', '22001', '22003', '22007', '22008', '22021'].includes(e.code))
      throw new DataError('invalid');
    // FK: lista/jogo inexistente ou de outro usuário (ex.: (user_id, list_id) → game_list).
    if (e.code === '23503') throw new DataError('not_found');
    if (e.code === '23505') throw new DataError('conflict', 'conflict', e.constraint_name);
  }
  throw e;
}
