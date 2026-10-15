// Postgres: entradas da fila numa única consulta (jogos, lista, pins e config da lista).
// Um round trip e leitura consistente; vale só quando jogos, listas, pins e config estão
// no mesmo banco.
import type { Game, GameList } from '../../../../../../packages/core/src/models.ts';
import type { Sql } from '../../db.ts';
import type { QueueInputsDriver, QueueInputsRecord, ScoringRecord } from '../types.ts';
import {
  gameFrom,
  gameJson,
  isoTs,
  pinOrder,
  settingsJson,
  toGame,
  type RawGame,
} from './shared.ts';

export class PgQueueInputsDriver implements QueueInputsDriver {
  private sql: Sql;
  constructor(sql: Sql) {
    this.sql = sql;
  }
  /** Sem `listId`, usa a lista mais antiga do usuário. */
  async load(owner: string, listId?: string): Promise<QueueInputsRecord | null> {
    const sql = this.sql;
    const [row] = await sql<
      {
        list: GameList | null;
        games: RawGame[];
        pins: { gameId: string; position: number }[];
        settings: ScoringRecord | null;
      }[]
    >`
      WITH l AS (
        SELECT l.id, l.name, l.created_at FROM game_list l
         WHERE l.user_id = ${owner} AND (${listId ?? null}::uuid IS NULL OR l.id = ${listId ?? null}::uuid)
         ORDER BY l.created_at, l.id LIMIT 1)
      SELECT (SELECT json_build_object('id', l.id, 'name', l.name, 'createdAt', ${isoTs(sql, sql`l.created_at`)}) FROM l) AS list,
             (SELECT coalesce(json_agg(${gameJson(sql)} ORDER BY e.id), '[]')
                FROM ${gameFrom(sql)} WHERE e.user_id = ${owner}) AS games,
             (SELECT coalesce(json_agg(json_build_object('gameId', g.code, 'position', a.manual_position)
                                       ORDER BY ${pinOrder(sql)}), '[]')
                FROM queue_manual_adjustment a JOIN game g ON g.id = a.game_id
               WHERE a.list_id = (SELECT id FROM l) AND a.manual_position IS NOT NULL) AS pins,
             (${settingsJson(sql)} WHERE w.list_id = (SELECT id FROM l)) AS settings`;
    if (!row.list) return null;
    return {
      list: row.list,
      games: row.games.map(toGame) as Game[],
      pins: row.pins,
      settings: row.settings,
    };
  }
}
