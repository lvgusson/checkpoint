// Postgres: registro de versões (app_release) e evidências de build (app_release_deploy).
// Também usado pelos scripts de release, que passam a própria conexão.
import type { Sql } from '../../db.ts';
import type { DeployInput, Environment, NewRelease, Release } from '../../../domain/releases.ts';
import type { ReleaseDriver } from '../types.ts';
import { pgError } from './shared.ts';

const rowJson = (sql: Sql) => sql`
  json_build_object(
    'id', r.id, 'version', r.version, 'name', r.name, 'kind', r.kind,
    'description', r.description, 'gitSha', r.git_sha, 'gitRef', r.git_ref,
    'environment', r.environment, 'rollbackTo', r.rollback_to, 'createdBy', r.created_by,
    'createdAt', to_char(r.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'deploy', (SELECT json_build_object(
                 'vercelDeploymentId', d.vercel_deployment_id, 'vercelUrl', d.vercel_url,
                 'dbMigrationVersion', d.db_migration_version,
                 'createdAt', to_char(d.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
                 FROM app_release_deploy d WHERE d.release_id = r.id
                ORDER BY d.id DESC LIMIT 1))`;

export class PgReleaseDriver implements ReleaseDriver {
  private sql: Sql;
  constructor(sql: Sql) {
    this.sql = sql;
  }
  async list(environment: Environment, limit: number, beforeId: number | null) {
    const sql = this.sql;
    const rows = await sql<{ r: Release }[]>`
      SELECT ${rowJson(sql)} AS r FROM app_release r
       WHERE r.environment = ${environment} ${beforeId ? sql`AND r.id < ${beforeId}` : sql``}
       ORDER BY r.id DESC LIMIT ${limit}`;
    return rows.map((x) => x.r);
  }
  async bySha(environment: Environment, gitSha: string, includeRollback: boolean) {
    const sql = this.sql;
    const [row] = await sql<{ r: Release }[]>`
      SELECT ${rowJson(sql)} AS r FROM app_release r
       WHERE r.environment = ${environment} AND (${includeRollback} OR r.kind <> 'rollback')
         AND r.git_sha = ${gitSha}
       ORDER BY r.id DESC LIMIT 1`;
    return row?.r ?? null;
  }
  async insert(row: NewRelease) {
    const sql = this.sql;
    const [created] = await sql<{ r: Release }[]>`
      WITH r AS (
        INSERT INTO app_release (version, name, kind, description, git_sha, git_ref, environment,
                                 rollback_to, created_by)
        VALUES (${row.version}, ${row.name}, ${row.kind}, ${row.description}, ${row.gitSha},
                ${row.gitRef}, ${row.environment}, ${row.rollbackTo}, ${row.createdBy})
        RETURNING *)
      SELECT ${rowJson(sql)} AS r FROM r`.catch(pgError);
    return created.r;
  }
  async recordDeploy(releaseId: number, d: DeployInput) {
    await this.sql`
      INSERT INTO app_release_deploy (release_id, git_sha, environment, vercel_deployment_id,
                                      vercel_url, db_migration_version)
      VALUES (${releaseId}, ${d.gitSha}, ${d.environment}, ${d.vercelDeploymentId},
              ${d.vercelUrl}, ${d.dbMigrationVersion})
      ON CONFLICT (vercel_deployment_id) DO NOTHING`;
  }
  async deployed(deploymentId: string | null, gitSha: string | null, environment: string) {
    const rows = await this.sql<
      {
        version: string;
        name: string | null;
        description: string;
        git_sha: string;
        environment: string;
        deployed_at: Date;
      }[]
    >`
      SELECT r.version, r.name, r.description, r.git_sha, r.environment,
             coalesce(d.created_at, r.created_at) AS deployed_at
        FROM app_release r
        LEFT JOIN app_release_deploy d
          ON d.release_id = r.id AND d.vercel_deployment_id = ${deploymentId}
       WHERE d.id IS NOT NULL
          OR (r.git_sha = ${gitSha}
              AND r.environment = ${environment})
       ORDER BY (d.id IS NOT NULL) DESC, r.id DESC
       LIMIT 1`;
    const r = rows[0];
    if (!r) return null;
    return {
      version: r.version,
      name: r.name,
      description: r.description,
      gitSha: r.git_sha,
      environment: r.environment,
      deployedAt: new Date(r.deployed_at).toISOString(),
    };
  }
}
