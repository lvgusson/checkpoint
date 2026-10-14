// Append-only release registration, build evidence, and dedicated-token routes.
import { timingSafeEqual } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import { db, type Sql } from './db.ts';
import { AppError } from './service.ts';

export const RELEASE_KINDS = [
  'feature',
  'fix',
  'refactor',
  'chore',
  'release',
  'rollback',
] as const;
export type ReleaseKind = (typeof RELEASE_KINDS)[number];
export const ENVIRONMENTS = ['production', 'preview', 'development'] as const;
export type Environment = (typeof ENVIRONMENTS)[number];
export type Bump = 'patch' | 'minor' | 'major';

export interface Release {
  id: number;
  version: string;
  name: string | null;
  kind: ReleaseKind;
  description: string;
  gitSha: string;
  gitRef: string | null;
  environment: Environment;
  rollbackTo: number | null;
  createdBy: string | null;
  createdAt: string;
  /** Latest build evidence for this registration. */
  deploy: ReleaseDeploy | null;
}
export interface ReleaseDeploy {
  vercelDeploymentId: string | null;
  vercelUrl: string | null;
  dbMigrationVersion: string | null;
  createdAt: string;
}
export interface ReleaseInput {
  description: string;
  kind: ReleaseKind;
  name: string | null;
  gitSha: string;
  gitRef: string | null;
  environment: Environment;
  bump: Bump;
  version: string | null;
  rollbackTo: number | null;
  createdBy: string | null;
}
export interface NewRelease extends Omit<ReleaseInput, 'bump'> {
  version: string;
}
export interface DeployInput {
  gitSha: string;
  environment: Environment;
  vercelDeploymentId: string | null;
  vercelUrl: string | null;
  dbMigrationVersion: string | null;
}

// ---------------------------------------------------------------- SemVer
const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
export const FIRST_VERSION = '0.0.1';

export function parseSemver(v: string): [number, number, number] | null {
  const m = SEMVER.exec(v);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}
export function compareSemver(a: string, b: string): number {
  const x = parseSemver(a)!,
    y = parseSemver(b)!;
  return x[0] - y[0] || x[1] - y[1] || x[2] - y[2];
}
/** Increment patch by default; minor and major reset subordinate components. */
export function bumpVersion(latest: string | null, bump: Bump = 'patch'): string {
  const v = latest ? parseSemver(latest) : null;
  if (!v) return bump === 'major' ? '1.0.0' : bump === 'minor' ? '0.1.0' : FIRST_VERSION;
  if (bump === 'major') return `${v[0] + 1}.0.0`;
  if (bump === 'minor') return `${v[0]}.${v[1] + 1}.0`;
  return `${v[0]}.${v[1]}.${v[2] + 1}`;
}
/** Use an explicit version greater than the latest or increment it. */
export function resolveVersion(
  latest: string | null,
  input: Pick<ReleaseInput, 'bump' | 'version'>,
) {
  if (!input.version) return bumpVersion(latest, input.bump);
  if (latest && compareSemver(input.version, latest) <= 0)
    throw new AppError(`A versão ${input.version} precisa ser maior que a atual (${latest})`, 409);
  return input.version;
}

// ---------------------------------------------------------------- validation
const SHA = /^[0-9a-f]{40}$/i;
export function normalizeGitSha(value: string): string {
  const sha = value.trim();
  if (!SHA.test(sha)) throw new AppError('gitSha deve conter 40 caracteres hexadecimais');
  return sha.toLowerCase();
}
const str = (v: unknown) => (typeof v === 'string' ? v.trim() : v);

export function parseReleaseInput(body: Record<string, unknown>): ReleaseInput {
  const allowed = [
    'description',
    'kind',
    'name',
    'bump',
    'version',
    'gitSha',
    'gitRef',
    'environment',
  ];
  const extra = Object.keys(body).filter((k) => !allowed.includes(k));
  if (extra.length) throw new AppError('Campo não aceito: ' + extra.join(', '));
  const description = str(body.description);
  if (typeof description !== 'string' || description.length < 3 || description.length > 500)
    throw new AppError('description deve ter de 3 a 500 caracteres');
  const kind = str(body.kind ?? 'chore');
  if (!RELEASE_KINDS.includes(kind as ReleaseKind) || kind === 'rollback')
    throw new AppError(
      `kind deve ser um de: ${RELEASE_KINDS.filter((k) => k !== 'rollback').join(', ')}`,
    );
  const name = body.name === undefined || body.name === null ? null : str(body.name);
  if (name !== null && (typeof name !== 'string' || !name || name.length > 80))
    throw new AppError('name deve ter de 1 a 80 caracteres');
  const bump = str(body.bump ?? 'patch');
  if (bump !== 'patch' && bump !== 'minor' && bump !== 'major')
    throw new AppError('bump deve ser patch, minor ou major');
  const version = body.version === undefined || body.version === null ? null : str(body.version);
  if (version !== null && (typeof version !== 'string' || !parseSemver(version)))
    throw new AppError('version deve ser SemVer (ex.: 1.0.0)');
  if (version !== null && body.bump !== undefined)
    throw new AppError('Envie version ou bump, não os dois');
  const gitSha = str(body.gitSha);
  if (typeof gitSha !== 'string' || !SHA.test(gitSha))
    throw new AppError('gitSha deve conter 40 caracteres hexadecimais');
  const gitRef = body.gitRef === undefined || body.gitRef === null ? null : str(body.gitRef);
  if (gitRef !== null && (typeof gitRef !== 'string' || !gitRef || gitRef.length > 200))
    throw new AppError('gitRef inválido');
  const environment = str(body.environment ?? 'production');
  if (!ENVIRONMENTS.includes(environment as Environment))
    throw new AppError('environment deve ser production, preview ou development');
  return {
    description,
    kind: kind as ReleaseKind,
    name,
    gitSha: gitSha.toLowerCase(),
    gitRef,
    environment: environment as Environment,
    bump,
    version,
    rollbackTo: null,
    createdBy: null,
  };
}

// ---------------------------------------------------------------- storage
export interface ReleaseStore {
  list(environment: Environment, limit: number, beforeId: number | null): Promise<Release[]>;
  latest(environment: Environment): Promise<Release | null>;
  /** Find exact commit registration; exclude rollback unless requested. */
  bySha(
    environment: Environment,
    gitSha: string,
    includeRollback?: boolean,
  ): Promise<Release | null>;
  /** Insert registration; version conflicts require allocation retry. */
  insert(row: NewRelease): Promise<Release>;
  recordDeploy(releaseId: number, deploy: DeployInput): Promise<void>;
}
export class VersionTaken extends Error {}
export class ReleaseAlreadyExists extends Error {
  release: Release;
  constructor(release: Release) {
    super('Commit already registered');
    this.release = release;
  }
}

/** Ordinary registrations are idempotent by commit/environment; rollbacks always create an event. Retry allocation and return existing registrations accurately. */
export async function createRelease(
  store: ReleaseStore,
  input: ReleaseInput,
): Promise<{ release: Release; created: boolean }> {
  input = { ...input, gitSha: normalizeGitSha(input.gitSha) };
  if (input.kind !== 'rollback') {
    const existing = await store.bySha(input.environment, input.gitSha);
    if (existing) return { release: existing, created: false };
  }
  for (let attempt = 0; ; attempt++) {
    const latest = await store.latest(input.environment);
    const version = resolveVersion(latest?.version ?? null, input);
    try {
      const { bump: _bump, ...row } = input;
      return { release: await store.insert({ ...row, version }), created: true };
    } catch (e) {
      if (e instanceof ReleaseAlreadyExists) return { release: e.release, created: false };
      if (!(e instanceof VersionTaken) || input.version || attempt >= 4) throw e;
    }
  }
}

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

/** PostgreSQL release storage uses SELECT and INSERT. */
export class PgReleaseStore implements ReleaseStore {
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
  async latest(environment: Environment): Promise<Release | null> {
    return (await this.list(environment, 1, null))[0] ?? null;
  }
  async bySha(
    environment: Environment,
    gitSha: string,
    includeRollback = false,
  ): Promise<Release | null> {
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
    try {
      const [created] = await sql<{ r: Release }[]>`
        WITH r AS (
          INSERT INTO app_release (version, name, kind, description, git_sha, git_ref, environment,
                                   rollback_to, created_by)
          VALUES (${row.version}, ${row.name}, ${row.kind}, ${row.description}, ${row.gitSha},
                  ${row.gitRef}, ${row.environment}, ${row.rollbackTo}, ${row.createdBy})
          RETURNING *)
        SELECT ${rowJson(sql)} AS r FROM r`;
      return created.r;
    } catch (e) {
      const err = e as { code?: string; constraint_name?: string };
      if (err.code === '23505' && err.constraint_name === 'app_release_env_version_uidx')
        throw new VersionTaken(row.version);
      if (err.code === '23505' && err.constraint_name === 'app_release_env_sha_uidx') {
        const existing = await this.bySha(row.environment, row.gitSha);
        if (existing) throw new ReleaseAlreadyExists(existing);
      }
      throw e;
    }
  }
  async recordDeploy(releaseId: number, d: DeployInput) {
    await this.sql`
      INSERT INTO app_release_deploy (release_id, git_sha, environment, vercel_deployment_id,
                                      vercel_url, db_migration_version)
      VALUES (${releaseId}, ${d.gitSha}, ${d.environment}, ${d.vercelDeploymentId},
              ${d.vercelUrl}, ${d.dbMigrationVersion})
      ON CONFLICT (vercel_deployment_id) DO NOTHING`;
  }
}

/** Absent PostgreSQL storage returns null and release HTTP 503. */
export function releaseStoreFromEnv(env: Record<string, string | undefined> = process.env) {
  return env.DATABASE_URL ? new PgReleaseStore(db(env.DATABASE_URL)) : null;
}

/** Memory adapter for release and latest-build projections in tests. */
export class MemoryReleaseStore implements ReleaseStore {
  private rows: Release[] = [];
  private deploymentIds = new Set<string>();
  async list(environment: Environment, limit: number, beforeId: number | null) {
    return this.rows
      .filter((r) => r.environment === environment && (!beforeId || r.id < beforeId))
      .sort((a, b) => b.id - a.id)
      .slice(0, limit)
      .map((r) => structuredClone(r));
  }
  async latest(environment: Environment): Promise<Release | null> {
    return (await this.list(environment, 1, null))[0] ?? null;
  }
  async bySha(
    environment: Environment,
    gitSha: string,
    includeRollback = false,
  ): Promise<Release | null> {
    const hit = this.rows
      .filter((r) => r.environment === environment && (includeRollback || r.kind !== 'rollback'))
      .reverse()
      .find((r) => r.gitSha === gitSha);
    return hit ? structuredClone(hit) : null;
  }
  async insert(row: NewRelease) {
    const existing = row.kind !== 'rollback' ? await this.bySha(row.environment, row.gitSha) : null;
    if (existing) throw new ReleaseAlreadyExists(existing);
    if (this.rows.some((r) => r.environment === row.environment && r.version === row.version))
      throw new VersionTaken(row.version);
    const release: Release = {
      ...row,
      id: this.rows.length + 1,
      createdAt: new Date().toISOString(),
      deploy: null,
    };
    this.rows.push(release);
    return structuredClone(release);
  }
  async recordDeploy(releaseId: number, d: DeployInput) {
    const r = this.rows.find((x) => x.id === releaseId);
    if (!r || r.gitSha !== d.gitSha || r.environment !== d.environment)
      throw new AppError('Deployment identity does not match its release');
    if (d.vercelDeploymentId && this.deploymentIds.has(d.vercelDeploymentId)) return;
    if (d.vercelDeploymentId) this.deploymentIds.add(d.vercelDeploymentId);
    r.deploy = { ...d, createdAt: new Date().toISOString() };
  }
}

/** Reuse the newest matching registration including rollback, or register an automatic patch; append build evidence. */
export async function ensureRelease(
  store: ReleaseStore,
  base: {
    gitSha: string;
    gitRef: string | null;
    environment: Environment;
    commitMessage: string | null;
  },
  deploy: Omit<DeployInput, 'gitSha' | 'environment'>,
): Promise<{ release: Release; created: boolean }> {
  const gitSha = normalizeGitSha(base.gitSha);
  const existing = await store.bySha(base.environment, gitSha, true);
  const firstLine = base.commitMessage?.split('\n')[0]?.trim() ?? '';
  const description = (
    firstLine.length >= 3 ? firstLine : `Deploy ${base.gitSha.slice(0, 7)}`
  ).slice(0, 500);
  const result = existing
    ? { release: existing, created: false }
    : await createRelease(store, {
        description,
        kind: 'chore',
        name: null,
        gitSha,
        gitRef: base.gitRef,
        environment: base.environment,
        bump: 'patch',
        version: null,
        rollbackTo: null,
        createdBy: 'vercel-build',
      });
  await store.recordDeploy(result.release.id, {
    ...deploy,
    gitSha,
    environment: base.environment,
  });
  return result;
}

// ---------------------------------------------------------------- HTTP
/** Compare equal-length tokens in constant time; missing configuration disables POST. */
export function checkReleaseToken(req: IncomingMessage, expected: string | undefined) {
  if (!expected)
    throw new AppError('Registro de versões desativado (RELEASE_API_TOKEN ausente)', 503);
  const header =
    req.headers['x-release-token'] ?? req.headers.authorization?.replace(/^Bearer\s+/i, '');
  const given = Buffer.from(typeof header === 'string' ? header : '');
  const want = Buffer.from(expected);
  if (given.length !== want.length || !timingSafeEqual(given, want))
    throw new AppError('Token de release inválido', 401);
}

/** Public GET and dedicated-token POST; unsupported methods return 405 with Allow. */
export async function releaseRoute(
  store: ReleaseStore | null,
  req: IncomingMessage,
  url: URL,
  readJson: () => Promise<Record<string, unknown>>,
  token: string | undefined = process.env.RELEASE_API_TOKEN,
): Promise<{ status: number; data: unknown; headers?: Record<string, string> } | null> {
  const path = url.pathname;
  if (path !== '/api/v1/releases' && path !== '/api/v1/releases/latest') return null;
  const method = req.method ?? 'GET';
  const allow = path === '/api/v1/releases' ? 'GET, POST' : 'GET';
  if (method !== 'GET' && !(method === 'POST' && path === '/api/v1/releases'))
    return {
      status: 405,
      data: { error: { message: 'Método não permitido: versões são só leitura e inserção' } },
      headers: { Allow: allow },
    };
  if (!store) throw new AppError('Registro de versões indisponível (sem banco)', 503);
  const environment = (url.searchParams.get('environment') ?? 'production') as Environment;
  if (!ENVIRONMENTS.includes(environment)) throw new AppError('environment inválido');
  if (path === '/api/v1/releases/latest') {
    const latest = await store.latest(environment);
    if (!latest) throw new AppError('Nenhuma versão registrada', 404);
    return { status: 200, data: latest };
  }
  if (method === 'GET') {
    const limit = Math.max(1, Math.min(100, Number(url.searchParams.get('limit')) || 20));
    const before = Number(url.searchParams.get('before')) || null;
    const items = await store.list(environment, limit, before);
    return {
      status: 200,
      data: { items, nextBefore: items.length === limit ? items.at(-1)!.id : null },
    };
  }
  checkReleaseToken(req, token);
  const input = parseReleaseInput(await readJson());
  const { release, created } = await createRelease(store, { ...input, createdBy: 'api' });
  return { status: created ? 201 : 200, data: { ...release, created } };
}
