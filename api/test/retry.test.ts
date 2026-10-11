import { test } from 'node:test';
import assert from 'node:assert/strict';
import { retry, retryDelay, sleep } from '../src/retry.ts';

/** sleep falso: registra as esperas sem esperar. */
const fakeSleep = () => {
  const waits: number[] = [];
  return { waits, sleep: async (ms: number) => void waits.push(ms) };
};

test('padrão: 5 tentativas com esperas 200, 400, 800, 1600 e lança o último erro', async () => {
  const { waits, sleep } = fakeSleep();
  let calls = 0;
  await assert.rejects(
    retry(
      async (attempt) => {
        calls++;
        throw new Error('falha ' + attempt);
      },
      { sleep },
    ),
    /falha 5/,
  );
  assert.equal(calls, 5);
  assert.deepEqual(waits, [200, 400, 800, 1600]);
});

test('para assim que dá certo', async () => {
  const { waits, sleep } = fakeSleep();
  const value = await retry(
    async (attempt) => {
      if (attempt < 3) throw new Error('ainda não');
      return 'ok';
    },
    { sleep },
  );
  assert.equal(value, 'ok');
  assert.deepEqual(waits, [200, 400]);
});

test('opções: tentativas, espera inicial, fator, teto e onRetry', async () => {
  const { waits, sleep } = fakeSleep();
  const seen: [number, number][] = [];
  await assert.rejects(
    retry(
      async () => {
        throw new Error('x');
      },
      {
        attempts: 4,
        initialDelayMs: 100,
        factor: 3,
        maxDelayMs: 500,
        sleep,
        onRetry: (_e, attempt, delay) => seen.push([attempt, delay]),
      },
    ),
  );
  assert.deepEqual(waits, [100, 300, 500]);
  assert.deepEqual(seen, [
    [1, 100],
    [2, 300],
    [3, 500],
  ]);
  assert.equal(retryDelay(5), 3200);
});

test('shouldRetry false desiste na primeira falha', async () => {
  const { waits, sleep } = fakeSleep();
  let calls = 0;
  await assert.rejects(
    retry(
      async () => {
        calls++;
        throw new RangeError('inválido');
      },
      { sleep, shouldRetry: (e) => !(e instanceof RangeError) },
    ),
    RangeError,
  );
  assert.equal(calls, 1);
  assert.deepEqual(waits, []);
});

test('signal cancela a espera e as próximas tentativas', async () => {
  const controller = new AbortController();
  let calls = 0;
  const run = retry(
    async () => {
      calls++;
      throw new Error('x');
    },
    { initialDelayMs: 60_000, signal: controller.signal },
  );
  controller.abort(new Error('cancelado'));
  await assert.rejects(run, /cancelado/);
  assert.equal(calls, 1);
  await assert.rejects(sleep(10, controller.signal), /cancelado/);
  await assert.rejects(
    retry(async () => 1, { attempts: 0 }),
    RangeError,
  );
});
