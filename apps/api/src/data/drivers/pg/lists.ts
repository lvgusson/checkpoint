// Postgres: listas do usuário em game_list.
import type { GameList } from '../../../../../../packages/core/src/models.ts';
import type { Sql } from '../../db.ts';
import type { ListsDriver } from '../types.ts';
import { pgError } from './shared.ts';

type RawList = Omit<GameList, 'createdAt'> & { createdAt: Date };
const toList = (r: RawList): GameList => ({ ...r, createdAt: r.createdAt.toISOString() });

export class PgListsDriver implements ListsDriver {
  private sql: Sql;
  constructor(sql: Sql) {
    this.sql = sql;
  }
  async list(owner: string): Promise<GameList[]> {
    const rows = await this.sql<RawList[]>`
      SELECT id, name, created_at AS "createdAt" FROM game_list
       WHERE user_id = ${owner}
       ORDER BY created_at, id`;
    return rows.map(toList);
  }
  async get(owner: string, id: string): Promise<GameList | undefined> {
    const [row] = await this.sql<RawList[]>`
      SELECT id, name, created_at AS "createdAt" FROM game_list WHERE id = ${id} AND user_id = ${owner}`;
    return row && toList(row);
  }
  /** Nome repetido (índice único user_id + lower(name)) → DataError('conflict'). */
  async create(owner: string, name: string): Promise<GameList> {
    const [row] = await this.sql<RawList[]>`
      INSERT INTO game_list (user_id, name) VALUES (${owner}, ${name})
      RETURNING id, name, created_at AS "createdAt"`.catch(pgError);
    return toList(row);
  }
  async rename(owner: string, id: string, name: string): Promise<GameList | undefined> {
    const [row] = await this.sql<RawList[]>`
      UPDATE game_list SET name = ${name} WHERE id = ${id} AND user_id = ${owner}
      RETURNING id, name, created_at AS "createdAt"`.catch(pgError);
    return row && toList(row);
  }
  /**
   * Apaga a lista (cascata: config, ajustes e histórico dela) se não for a única.
   * Duas exclusões simultâneas das duas últimas listas poderiam passar juntas; o caso é
   * inofensivo (a próxima leitura recria a padrão).
   */
  async remove(owner: string, id: string): Promise<'removed' | 'missing' | 'last'> {
    const [row] = await this.sql<{ found: boolean; deleted: boolean }[]>`
      WITH target AS (SELECT id FROM game_list WHERE id = ${id} AND user_id = ${owner}),
           d AS (
             DELETE FROM game_list
              WHERE id IN (SELECT id FROM target)
                AND (SELECT count(*) FROM game_list WHERE user_id = ${owner}) > 1
             RETURNING id)
      SELECT EXISTS (SELECT 1 FROM target) AS found, EXISTS (SELECT 1 FROM d) AS deleted`;
    return !row.found ? 'missing' : row.deleted ? 'removed' : 'last';
  }
}
