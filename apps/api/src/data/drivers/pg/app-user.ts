// Postgres: contas (app_user) ligadas à identidade do Supabase Auth.
import type { Sql } from '../../db.ts';
import type { AppUserDriver } from '../types.ts';

export class PgAppUserDriver implements AppUserDriver {
  private sql: Sql;
  constructor(sql: Sql) {
    this.sql = sql;
  }
  async findByAuthId(authId: string) {
    const [found] = await this.sql<{ id: string }[]>`
      SELECT id FROM app_user WHERE auth_user_id = ${authId}`;
    return found?.id;
  }
  async claimSeed(seedId: string, authId: string, email: string, seedOwnerEmail: string) {
    const [claimed] = await this.sql<{ id: string }[]>`
      UPDATE app_user
         SET auth_user_id = ${authId}, email = coalesce(email, ${email})
       WHERE id = ${seedId}
         AND auth_user_id IS NULL
         AND (lower(email) = lower(${email}) OR lower(${email}) = lower(${seedOwnerEmail}))
      RETURNING id`;
    return claimed?.id;
  }
  async create(authId: string, email: string | null) {
    const [created] = await this.sql<{ id: string }[]>`
      INSERT INTO app_user (id, auth_user_id, email)
      VALUES (${authId}, ${authId},
              CASE WHEN NOT EXISTS (SELECT 1 FROM app_user WHERE lower(email) = lower(${email}))
                   THEN ${email}::text END)
      ON CONFLICT (id) DO UPDATE SET auth_user_id = EXCLUDED.auth_user_id
        WHERE app_user.auth_user_id IS NULL OR app_user.auth_user_id = EXCLUDED.auth_user_id
      RETURNING id`;
    return created?.id;
  }
}
