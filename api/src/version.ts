// Resolve deployment registration, matching commit, then package/Git fallback. Cache database evidence.
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { db } from './db.ts';

export interface VersionInfo {
  version: string;
  /** Registration name and description, or null in fallback. */
  name: string | null;
  description: string | null;
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
        ON d.release_id = r.id AND d.vercel_deployment_id = ${env.VERCEL_DEPLOYMENT_ID ?? null}
     WHERE d.id IS NOT NULL
        OR (r.git_sha = ${env.VERCEL_GIT_COMMIT_SHA?.trim().toLowerCase() ?? null}
            AND r.environment = ${env.VERCEL_ENV ?? 'development'})
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

async function fallback(): Promise<VersionInfo> {
  let version = '0.0.0';
  try {
    version = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8')).version ?? version;
  } catch {
    /* Package metadata unavailable. */
  }
  let gitSha = process.env.VERCEL_GIT_COMMIT_SHA?.trim().toLowerCase() || null;
  if (!gitSha) {
    try {
      gitSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
    } catch {
      /* Git unavailable. */
    }
  }
  return {
    version,
    name: null,
    description: null,
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
  if (!process.env.VERCEL) cached = fb; // Keep hosted fallback uncached because evidence may arrive later.
  return fb;
}
