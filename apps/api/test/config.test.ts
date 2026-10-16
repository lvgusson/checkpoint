import { expect, it } from 'vitest';
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

it('ordinary users cannot change shared options', async () => {
  const config = service();
  await expect(
    runWithContext({ role: Role.User }, () => config.add('genres', { name: 'Private' })),
  ).rejects.toMatchObject({ code: 403 });
});
it('admin adds and removes options through config route', async () => {
  const config = service();
  const url = new URL('http://localhost/api/v1/config/options/genres');
  const added = await admin(() =>
    configRoute(config, { method: 'POST' } as IncomingMessage, url, async () => ({
      name: 'New genre',
    })),
  );
  expect(added && 'status' in added ? added.status : undefined).toBe(201);
  expect((await config.list()).genres.includes('New genre')).toBeTruthy();
  await admin(() =>
    configRoute(config, { method: 'DELETE' } as IncomingMessage, url, async () => ({
      name: 'New genre',
    })),
  );
  expect(!(await config.list()).genres.includes('New genre')).toBeTruthy();
});
it('validation rejects unknown categories, duplicate canonical names, extra fields and long names', async () => {
  const config = service();
  for (const [category, body] of [
    ['__proto__', { name: 'x' }],
    ['genres', { name: 'x', owner: 'other' }],
    ['genres', { name: 'x'.repeat(121) }],
  ] as const) {
    await expect(admin(() => config.add(category, body))).rejects.toMatchObject({ code: 400 });
  }
  await admin(() => config.add('genres', { name: 'Example' }));
  await expect(admin(() => config.add('genres', { name: ' Éxample ' }))).rejects.toMatchObject({
    code: 409,
  });
});
it('local options persist after restarting the store', async () => {
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
    expect((await second.list()).genres.includes('Persisted option')).toBeTruthy();
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
it('options used by a game cannot be deleted', async () => {
  const { seedGames } = await import('../src/data/seed.ts');
  const game = structuredClone(seedGames[0]);
  game.primaryGenre = 'Used genre';
  const config = new ConfigService(
    new ConfigRepositoryImpl(new JsonConfigDriver(null, new JsonGamesDriver([game], null))),
  );
  await expect(admin(() => config.remove('genres', { name: 'Used genre' }))).rejects.toMatchObject({
    code: 409,
  });
  expect((await config.list()).genres.includes('Used genre')).toBeTruthy();
});
