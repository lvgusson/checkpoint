// Append-only release registration, build evidence, and dedicated-token routes.
import { AppError } from '../shared/errors.ts';

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
  if (!m) return null;
  const parts = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (!parts.every(Number.isSafeInteger)) return null;
  return [parts[0], parts[1], parts[2]];
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
  const next =
    bump === 'major'
      ? [v[0] + 1, 0, 0]
      : bump === 'minor'
        ? [v[0], v[1] + 1, 0]
        : [v[0], v[1], v[2] + 1];
  if (!next.every(Number.isSafeInteger))
    throw new AppError('Número de versão excede o limite suportado', 400);
  return `${next[0]}.${next[1]}.${next[2]}`;
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

export class VersionTaken extends Error {}
export class ReleaseAlreadyExists extends Error {
  release: Release;
  constructor(release: Release) {
    super('Commit already registered');
    this.release = release;
  }
}
