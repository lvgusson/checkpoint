// GET /api/v1/version: versão do deploy corrente.
//
// Na Vercel procura a linha de app_release do próprio deploy (VERCEL_DEPLOYMENT_ID, ou
// VERCEL_GIT_COMMIT_SHA + VERCEL_ENV). Sem banco/linha cai no package.json + SHA do
// ambiente ou `git rev-parse HEAD` (dev). O resultado é memorizado por instância:
// um deploy é imutável.
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { db } from './db.ts';

export interface VersionInfo {
  version: string;
  gitSha: string | null;
  environment: string;
  deployedAt: string | null;
}

const root = fileURLToPath(new URL('../../', import.meta.url));
let cached: VersionInfo | null = null;

async function fromDb(): Promise<VersionInfo | null> {
  const env = process.env;
  if (!env.DATABASE_URL || !(env.VERCEL_DEPLOYMENT_ID || env.VERCEL_GIT_COMMIT_SHA)) return null;
  const sql = db();
  const rows = await sql<
    { version: string; git_sha: string; environment: string; created_at: Date }[]
  >`
    SELECT version, git_sha, environment, created_at FROM app_release
     WHERE vercel_deployment_id = ${env.VERCEL_DEPLOYMENT_ID ?? null}
        OR (git_sha = ${env.VERCEL_GIT_COMMIT_SHA ?? null} AND environment = ${env.VERCEL_ENV ?? 'development'})
     ORDER BY (vercel_deployment_id = ${env.VERCEL_DEPLOYMENT_ID ?? null}) DESC NULLS LAST, created_at DESC
     LIMIT 1`;
  const r = rows[0];
  if (!r) return null;
  return {
    version: r.version,
    gitSha: r.git_sha,
    environment: r.environment,
    deployedAt: new Date(r.created_at).toISOString(),
  };
}

async function fallback(): Promise<VersionInfo> {
  let version = '0.0.0';
  try {
    version = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8')).version ?? version;
  } catch {
    /* package.json indisponível */
  }
  let gitSha = process.env.VERCEL_GIT_COMMIT_SHA || null;
  if (!gitSha) {
    try {
      gitSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
    } catch {
      /* sem git */
    }
  }
  return {
    version,
    gitSha,
    environment: process.env.VERCEL_ENV || 'development',
    deployedAt: null,
  };
}

export async function currentVersion(): Promise<VersionInfo> {
  if (cached) return cached;
  let info: VersionInfo | null = null;
  try {
    info = await fromDb();
  } catch (err) {
    console.error('version: falha ao ler app_release', err);
  }
  if (info) return (cached = info);
  const fb = await fallback();
  if (!process.env.VERCEL) cached = fb; // na Vercel não memoriza: a linha pode aparecer depois
  return fb;
}
