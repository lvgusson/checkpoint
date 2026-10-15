import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRateLimiter } from '../src/auth/rate-limit.ts';
import { SteamClient, parseSteamProfile } from '../src/integrations/steam/client.ts';
import { redact } from '../src/observability/logger.ts';
import { SafeSink } from '../src/observability/sinks.ts';
import type { LogEvent } from '../../../packages/core/src/observability.ts';

const event = (name: string): LogEvent => ({
  event: name,
  time: new Date().toISOString(),
  level: 'info',
  fields: {},
});

test('rate limiter rejects new identities at capacity and recovers expired windows', () => {
  const allow = createRateLimiter(2, 100, 2);
  assert.equal(allow('a', 0), true);
  assert.equal(allow('b', 0), true);
  assert.equal(allow('c', 0), false);
  assert.equal(allow('a', 0), true);
  assert.equal(allow('a', 0), false);
  assert.equal(allow('c', 100), true);
});

test('Steam profile rejects query injection and malformed profile IDs', async () => {
  assert.equal(parseSteamProfile('https://steamcommunity.com/profiles/123&other=value'), null);
  assert.equal(parseSteamProfile('https://steamcommunity.com/profiles/123'), null);
  assert.deepEqual(parseSteamProfile('https://steamcommunity.com/profiles/76561198000000000'), {
    steamId: '76561198000000000',
  });
  let calls = 0;
  const client = new SteamClient({
    fetch: async () => {
      calls++;
      return Response.json({});
    },
  });
  await assert.rejects(client.wishlist('123&key=secret'), /inválido/);
  assert.equal(calls, 0);
});

test('log redaction masks Steam query keys in messages and errors', () => {
  assert.equal(redact('https://steam/x?key=secret&x=1'), 'https://steam/x?key=[redacted]&x=1');
  assert.equal(
    (redact(new Error('request ?KEY=secret')) as { message: string }).message,
    'request ?KEY=[redacted]',
  );
});

test('SafeSink resumes after an empty flush', async () => {
  const seen: string[] = [];
  const sink = new SafeSink({
    write(e) {
      seen.push(e.event);
    },
  });
  await sink.flush();
  sink.write(event('later'));
  await sink.flush();
  assert.deepEqual(seen, ['later']);
});

test('SafeSink drops the oldest waiting event without dropping the next event on completion', async () => {
  const seen: string[] = [];
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const sink = new SafeSink(
    {
      async write(e) {
        seen.push(e.event);
        if (e.event === 'a') await gate;
      },
    },
    2,
  );
  sink.write(event('a'));
  await Promise.resolve();
  sink.write(event('b'));
  sink.write(event('c'));
  sink.write(event('d'));
  release();
  await sink.flush();
  assert.deepEqual(seen, ['a', 'c', 'd']);
  assert.equal(sink.dropped, 1);
});

const { assertPrivateStores, createRequestGuard } = await import('../src/shared/request-guard.ts');

test('authenticated startup refuses every private JSON override and mixed identities', () => {
  const names = ['GAMES_STORE', 'LISTS_STORE', 'PINS_STORE', 'SCORING_STORE', 'APP_USERS_STORE'];
  const pg = Object.fromEntries(names.map((name) => [name, 'pg' as const]));
  assert.doesNotThrow(() => assertPrivateStores(pg, true));
  for (const name of names)
    assert.throws(() => assertPrivateStores({ ...pg, [name]: 'json' }, true));
  const json = Object.fromEntries(names.map((name) => [name, 'json' as const]));
  assert.throws(() => assertPrivateStores(json, true));
  assert.doesNotThrow(() => assertPrivateStores(json, false));
  assert.throws(() => assertPrivateStores({ ...pg, LISTS_STORE: 'json' }, false));
});

test('expensive operations reject overlapping calls and release failed work', async () => {
  const run = createRequestGuard(10, 60_000);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const first = run('a', () => gate);
  await assert.rejects(
    run('a', async () => 1),
    { code: 429 },
  );
  assert.equal(await run('b', async () => 2), 2);
  release();
  await first;
  await assert.rejects(
    run('a', async () => {
      throw new Error('work failed');
    }),
    /work failed/,
  );
  assert.equal(await run('a', async () => 3), 3);
});

test('expensive operations coalesce concurrent GET calls for identical key', async () => {
  const run = createRequestGuard(10, 60_000, 1);
  let calls = 0;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const work = async () => {
    calls++;
    await gate;
    return 'result';
  };

  const first = run('k', work, true);
  const second = run('k', work, true);

  release();
  const [res1, res2] = await Promise.all([first, second]);
  assert.equal(res1, 'result');
  assert.equal(res2, 'result');
  assert.equal(calls, 1);

  const third = await run(
    'k',
    async () => {
      calls++;
      return 'fresh';
    },
    true,
  );
  assert.equal(third, 'fresh');
  assert.equal(calls, 2);
});

test('coalesced in-flight promises propagate errors to all callers and clean up', async () => {
  const run = createRequestGuard(10, 60_000, 1);
  let release!: (err: Error) => void;
  const gate = new Promise<void>((_, reject) => {
    release = reject;
  });
  const first = run('err-key', () => gate, true);
  const second = run('err-key', () => gate, true);
  release(new Error('boom'));
  await assert.rejects(first, /boom/);
  await assert.rejects(second, /boom/);

  assert.equal(await run('err-key', async () => 'ok', true), 'ok');
});

test('request admission releases only once and counts requests after completion', async () => {
  const { createRequestAdmission } = await import('../src/shared/request-guard.ts');
  const acquire = createRequestAdmission(2, 60_000);
  const release = acquire('user');
  release();
  release();
  const second = acquire('user');
  second();
  assert.throws(() => acquire('user'), { code: 429 });
});

test('SafeSink retries failed writes and bounds final failure attempts', async () => {
  let attempts = 0;
  const sink = new SafeSink({
    write() {
      attempts++;
      throw new Error('unavailable');
    },
  });
  sink.write(event('failed'));
  await sink.flush();
  assert.equal(attempts, 3);
  assert.equal(sink.dropped, 1);
});

test('createData applies the private-store guard before opening storage', async () => {
  const { createData } = await import('../src/main/data.ts');
  const { closeDb } = await import('../src/data/db.ts');
  const names = ['GAMES_STORE', 'LISTS_STORE', 'PINS_STORE', 'SCORING_STORE', 'APP_USERS_STORE'];
  const auth = { SUPABASE_URL: 'https://auth.example.test' };
  try {
    await assert.rejects(
      createData({ dataDir: '/unavailable-security-test-path', env: auth }),
      /PostgreSQL/,
    );
    for (const name of names)
      await assert.rejects(
        createData({
          dataDir: '/unavailable-security-test-path',
          env: {
            ...auth,
            DATABASE_URL: 'postgres://postgres@127.0.0.1:54329/checkpoint_security_unused',
            [name]: 'json',
          },
        }),
        /Private stores|PostgreSQL/,
      );
  } finally {
    await closeDb();
  }
});
