// Release registration use cases over a ReleaseStore.
import type { ReleaseStore } from '../data/ports.ts';
import {
  ReleaseAlreadyExists,
  VersionTaken,
  normalizeGitSha,
  resolveVersion,
  type DeployInput,
  type Environment,
  type Release,
  type ReleaseInput,
} from '../domain/releases.ts';

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
