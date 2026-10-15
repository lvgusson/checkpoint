// Resolve deployment registration, matching commit, then package/Git fallback. Cache database evidence.
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ReleaseStore } from '../data/ports.ts';
import { logger } from '../observability/logger.ts';

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

async function fromDb(releases: ReleaseStore | null): Promise<VersionInfo | null> {
  const env = process.env;
  if (!releases || !(env.VERCEL_DEPLOYMENT_ID || env.VERCEL_GIT_COMMIT_SHA)) return null;
  return releases.deployed(
    env.VERCEL_DEPLOYMENT_ID ?? null,
    env.VERCEL_GIT_COMMIT_SHA?.trim().toLowerCase() ?? null,
    env.VERCEL_ENV ?? 'development',
  );
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

export async function currentVersion(releases: ReleaseStore | null): Promise<VersionInfo> {
  if (cached) return cached;
  let info: VersionInfo | null = null;
  try {
    info = await fromDb(releases);
  } catch (err) {
    logger.error('version.read_failed', { error: err });
  }
  if (info) return (cached = info);
  const fb = await fallback();
  if (!process.env.VERCEL) cached = fb; // Keep hosted fallback uncached because evidence may arrive later.
  return fb;
}
