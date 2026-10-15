import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ConfigService } from '../src/services/config.ts';
import { ConfigRepositoryImpl } from '../src/data/repositories/config.ts';
import { JsonConfigDriver } from '../src/data/drivers/json/config.ts';
import { JsonGamesDriver } from '../src/data/drivers/json/games.ts';
import { runWithContext } from '../src/shared/context.ts';
import { Role } from '../../../packages/core/src/authorization.ts';
import { configRoute } from '../src/routes/config.ts';
import type { IncomingMessage } from 'node:http';

const admin = <T>(fn: () => T) => runWithContext({ role: Role.Admin }, fn);
const service = () =>
  new ConfigService(
    new ConfigRepositoryImpl(new JsonConfigDriver(null, new JsonGamesDriver([], null))),
  );

test('ordinary users cannot change shared options', async () => {
  const config = service();
  await assert.rejects(
    runWithContext({ role: Role.User }, () => config.add('genres', { name: 'Private' })),
    { code: 403 },
  );
});
test('admin adds and removes options through config route', async () => {
  const config = service();
  const url = new URL('http://localhost/api/v1/config/options/genres');
  const added = await admin(() =>
    configRoute(config, { method: 'POST' } as IncomingMessage, url, async () => ({
      name: 'New genre',
    })),
  );
  assert.equal(added?.status, 201);
  assert.ok((await config.list()).genres.includes('New genre'));
  await admin(() =>
    configRoute(config, { method: 'DELETE' } as IncomingMessage, url, async () => ({
      name: 'New genre',
    })),
  );
  assert.ok(!(await config.list()).genres.includes('New genre'));
});
test('validation rejects unknown categories, duplicate canonical names, extra fields and long names', async () => {
  const config = service();
  for (const [category, body] of [
    ['__proto__', { name: 'x' }],
    ['genres', { name: 'x', owner: 'other' }],
    ['genres', { name: 'x'.repeat(121) }],
  ] as const) {
    await assert.rejects(
      admin(() => config.add(category, body)),
      { code: 400 },
    );
  }
  await admin(() => config.add('genres', { name: 'Example' }));
  await assert.rejects(
    admin(() => config.add('genres', { name: ' Éxample ' })),
    { code: 409 },
  );
});
test('local options persist after restarting the store', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'checkpoint-config-'));
  try {
    const path = join(dir, 'options.json');
    const first = new ConfigService(
      new ConfigRepositoryImpl(new JsonConfigDriver(path, new JsonGamesDriver([], null))),
    );
    await admin(() => first.add('genres', { name: 'Persisted option' }));
    const second = new ConfigService(
      new ConfigRepositoryImpl(new JsonConfigDriver(path, new JsonGamesDriver([], null))),
    );
    assert.ok((await second.list()).genres.includes('Persisted option'));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test('options used by a game cannot be deleted', async () => {
  const { seedGames } = await import('../src/data/seed.ts');
  const game = structuredClone(seedGames[0]);
  game.primaryGenre = 'Used genre';
  const config = new ConfigService(
    new ConfigRepositoryImpl(new JsonConfigDriver(null, new JsonGamesDriver([game], null))),
  );
  await assert.rejects(
    admin(() => config.remove('genres', { name: 'Used genre' })),
    { code: 409 },
  );
  assert.ok((await config.list()).genres.includes('Used genre'));
});
