// Postgres: pesos + regras + filtros de cada lista em user_score_weights (chave list_id).
import type { ScoringConfig } from '../../../../../../packages/core/src/models.ts';
import type { Sql } from '../../db.ts';
import type { ScoringDriver, ScoringRecord } from '../types.ts';
import { isoTs, json, pgError, settingsJson } from './shared.ts';

export class PgScoringDriver implements ScoringDriver {
  private sql: Sql;
  constructor(sql: Sql) {
    this.sql = sql;
  }
  async get(owner: string, listId: string): Promise<ScoringRecord | undefined> {
    const sql = this.sql;
    const [row] = await sql<{ settings: ScoringRecord | null }[]>`
      SELECT (${settingsJson(sql)} WHERE w.list_id = ${listId} AND w.user_id = ${owner}) AS settings`;
    return row?.settings ?? undefined;
  }
  /**
   * Upsert numa instrução; `version` sobe atomicamente. A FK (user_id, list_id) → game_list
   * impede gravar na lista de outro usuário (DataError 'not_found'); se a linha da lista já é de
   * outro usuário, o WHERE do upsert não atualiza e nada é devolvido.
   */
  async save(
    owner: string,
    listId: string,
    config: ScoringConfig,
  ): Promise<ScoringRecord | undefined> {
    const sql = this.sql;
    const [row] = await sql<{ settings: ScoringRecord }[]>`
      INSERT INTO user_score_weights AS w (list_id, user_id, weights, rules, filters)
      VALUES (${listId}, ${owner}, ${sql.json(json(config.weights))}::jsonb,
              ${sql.json(json(config.rules))}::jsonb, ${sql.json(json(config.filters))}::jsonb)
      ON CONFLICT (list_id) DO UPDATE
         SET weights = EXCLUDED.weights, rules = EXCLUDED.rules, filters = EXCLUDED.filters,
             version = w.version + 1
       WHERE w.user_id = EXCLUDED.user_id
      RETURNING json_build_object('weights', w.weights, 'rules', w.rules, 'filters', w.filters,
                'version', w.version, 'updatedAt', ${isoTs(sql, sql`w.updated_at`)}) AS settings`.catch(
      pgError,
    );
    return row?.settings;
  }
}
