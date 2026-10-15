// Postgres: pins da fila (queue_manual_adjustment) e histórico de movimentos (queue_move_event).
import type { ManualAdjustment, ManualMove } from '../../../../../../packages/core/src/models.ts';
import type { Sql } from '../../db.ts';
import type { PinsDriver } from '../types.ts';
import { pgError, pinOrder } from './shared.ts';

export class PgPinsDriver implements PinsDriver {
  private sql: Sql;
  constructor(sql: Sql) {
    this.sql = sql;
  }
  /** Pins da lista (manual_position preenchida), do movido há mais tempo ao mais recente. */
  async list(owner: string, listId: string): Promise<ManualAdjustment[]> {
    const sql = this.sql;
    const rows = await sql<(Omit<ManualAdjustment, 'updatedAt'> & { updatedAt: Date })[]>`
      SELECT g.code AS "gameId", a.manual_position AS "manualPosition",
             coalesce(a.last_moved_at, a.updated_at) AS "updatedAt"
        FROM queue_manual_adjustment a JOIN game g ON g.id = a.game_id
       WHERE a.list_id = ${listId} AND a.user_id = ${owner} AND a.manual_position IS NOT NULL
       ORDER BY ${pinOrder(sql)}`;
    return rows.map((r) => ({ ...r, updatedAt: r.updatedAt.toISOString() }));
  }
  /**
   * Um statement: registra o movimento (ON CONFLICT no client_request_id = move.id) e só
   * se ele for novo grava os pins. Retentativa de uma gravação que já entrou é no-op.
   * Só o jogo movido ganha recência (last_moved_at); os outros só corrigem o índice.
   * A FK (user_id, list_id) garante que a lista é do usuário.
   */
  async pin(
    owner: string,
    listId: string,
    pins: { gameId: string; position: number }[],
    move: ManualMove,
  ): Promise<void> {
    const codes = pins.map((p) => p.gameId),
      positions = pins.map((p) => p.position);
    await this.sql`
      WITH ev AS (
        INSERT INTO queue_move_event (user_id, list_id, game_id, kind, from_position, to_position, points_delta,
                                      flat_points_before, flat_points_after, source, client_request_id)
        SELECT ${owner}, ${listId}::uuid, e.game_id, 'move', ${move.fromPosition}::int,
               ${move.toPosition}::int, 0, 0, 0, 'drag', ${move.id}::uuid
          FROM library_entry e JOIN game g ON g.id = e.game_id
         WHERE e.user_id = ${owner} AND g.code = ${move.gameId}
        ON CONFLICT (user_id, client_request_id) WHERE client_request_id IS NOT NULL DO NOTHING
        RETURNING 1)
      INSERT INTO queue_manual_adjustment AS a
             (user_id, list_id, game_id, flat_points, manual_position, previous_position, move_count,
              last_moved_at)
      SELECT ${owner}, ${listId}::uuid, e.game_id, 0, p.pos,
             CASE WHEN g.code = ${move.gameId} THEN ${move.fromPosition}::int END,
             (g.code = ${move.gameId})::int, now()
        FROM unnest(${codes}::text[], ${positions}::int[]) AS p(code, pos)
        JOIN game g ON g.code = p.code
        JOIN library_entry e ON e.game_id = g.id AND e.user_id = ${owner}
       WHERE EXISTS (SELECT 1 FROM ev)
      ON CONFLICT (list_id, game_id) DO UPDATE
         SET manual_position   = EXCLUDED.manual_position,
             flat_points       = 0,
             previous_position = coalesce(EXCLUDED.previous_position, a.previous_position),
             move_count        = a.move_count + EXCLUDED.move_count,
             last_moved_at     = CASE WHEN EXCLUDED.move_count > 0 THEN now()
                                      ELSE coalesce(a.last_moved_at, a.updated_at) END
       WHERE a.user_id = EXCLUDED.user_id`.catch(pgError);
  }
  /** Reset: apaga o pin da lista e audita, num statement só. */
  async remove(owner: string, listId: string, gameId: string, move: ManualMove): Promise<boolean> {
    const rows = await this.sql`
      WITH d AS (
        DELETE FROM queue_manual_adjustment a USING game g
         WHERE a.list_id = ${listId} AND a.user_id = ${owner} AND a.game_id = g.id AND g.code = ${gameId}
        RETURNING a.game_id, a.manual_position)
      INSERT INTO queue_move_event (user_id, list_id, game_id, kind, from_position, to_position,
                                    points_delta, flat_points_before, flat_points_after, source,
                                    client_request_id)
      SELECT ${owner}, ${listId}::uuid, d.game_id, 'reset', ${move.fromPosition}::int, NULL, 0, 0, 0,
             'api', ${move.id}::uuid
        FROM d WHERE d.manual_position IS NOT NULL
      RETURNING 1`;
    return rows.length > 0;
  }
  /** Últimos 500 movimentos da lista, em ordem cronológica. */
  async moves(owner: string, listId: string, gameId?: string): Promise<ManualMove[]> {
    const sql = this.sql;
    const rows = await sql<(Omit<ManualMove, 'createdAt'> & { createdAt: Date })[]>`
      SELECT id, "gameId", kind, "fromPosition", "toPosition", "createdAt"
        FROM (SELECT coalesce(m.client_request_id::text, m.id::text) AS id, g.code AS "gameId",
                     CASE m.kind WHEN 'reset' THEN 'reset' ELSE 'reorder' END AS kind,
                     m.from_position AS "fromPosition", m.to_position AS "toPosition",
                     m.created_at AS "createdAt", m.id AS seq
                FROM queue_move_event m JOIN game g ON g.id = m.game_id
               WHERE m.list_id = ${listId} AND m.user_id = ${owner}
                     ${gameId ? sql`AND g.code = ${gameId}` : sql``}
               ORDER BY m.created_at DESC, m.id DESC
               LIMIT 500) x
       ORDER BY "createdAt", seq`;
    return rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }));
  }
}
