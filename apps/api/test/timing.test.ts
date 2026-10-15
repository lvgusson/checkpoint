import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  clientLatencyMs,
  detailEnabled,
  newTrace,
  serverTimingHeader,
  span,
  stageTable,
  traceStore,
  timed,
  type Trace,
} from '../src/observability/timing.ts';
import {
  clickToSendMs,
  computeTiming,
  parseServerTiming,
  summarize,
  type RequestTiming,
} from '../../web/src/api/timing.ts';

const NS = 1_000_000n; // one millisecond in ns
const trace = (over: Partial<Trace> = {}): Trace => ({ ...newTrace(null), t0: 0n, ...over });

test('clientLatencyMs is arrival minus client stamp', () => {
  assert.equal(clientLatencyMs(1_000_050, '1000000'), 50);
});

test('clientLatencyMs ignores a missing or invalid stamp', () => {
  assert.equal(clientLatencyMs(1_000_050, undefined), null);
  assert.equal(clientLatencyMs(1_000_050, 'abc'), null);
  assert.equal(clientLatencyMs(1_000_050, '-5'), null);
});

test('detailEnabled needs the env flag or the header, and an authenticated caller', () => {
  assert.equal(detailEnabled('1', undefined, true), true);
  assert.equal(detailEnabled(undefined, '1', true), true);
  assert.equal(detailEnabled(undefined, undefined, true), false);
  assert.equal(detailEnabled('1', '1', false), false);
  assert.equal(detailEnabled(undefined, '0', true), false);
});

test('serverTimingHeader sends only total and db without detail', () => {
  const t = trace({ dbNs: 1_234_567n, queries: 3, stages: { auth: 2n * NS } });
  assert.equal(serverTimingHeader(t, 12_345_678n, false), 'total;dur=12.346, db;dur=1.235;desc=3');
});

test('serverTimingHeader adds every stage with detail', () => {
  const t = trace({ recvMs: 20, stages: { auth: 2_500_000n, route: 8n * NS, ser: 100_000n } });
  assert.equal(
    serverTimingHeader(t, 12n * NS, true),
    'total;dur=12.000, db;dur=0.000;desc=0, recv;dur=20.000, auth;dur=2.500, route;dur=8.000, ser;dur=0.100',
  );
});

test('stageTable reports stages, db and query count in ms', () => {
  const t = trace({ dbNs: 4n * NS, queries: 2, stages: { route: 9n * NS } });
  assert.deepEqual(stageTable(t, 10n * NS), { total: 10, route: 9, db: 4, dbq: 2 });
});

test('span adds sync and async time to the trace and returns the result', async () => {
  const t = newTrace(null);
  await traceStore.run(t, async () => {
    assert.equal(
      span('route', () => 7),
      7,
    );
    assert.equal(await span('route', async () => 8), 8);
    await assert.rejects(span('auth', async () => Promise.reject(new Error('x'))));
    assert.throws(() =>
      span('ser', () => {
        throw new Error('y');
      }),
    );
  });
  assert.deepEqual(Object.keys(t.stages).sort(), ['auth', 'route', 'ser']);
});

test('span outside a request just runs the function', () => {
  assert.equal(
    span('route', () => 1),
    1,
  );
});

test('parseServerTiming reads the header produced by the server', () => {
  const header = serverTimingHeader(trace({ stages: { auth: NS } }), 5n * NS, true);
  assert.deepEqual(parseServerTiming(header), { total: 5, db: 0, auth: 1 });
  assert.deepEqual(parseServerTiming(null), {});
});

const base = { requestId: 'r', method: 'GET', path: 'games', status: 200 };

test('computeTiming splits browser total into server total and network', () => {
  const t = computeTiming({
    ...base,
    totalMs: 100.4567,
    clickToSendMs: 3,
    serverTiming: 'total;dur=30.250, db;dur=12.100;desc=3, auth;dur=2.000',
  });
  assert.deepEqual(t, {
    ...base,
    totalMs: 100.457,
    serverMs: 30.25,
    networkMs: 70.207,
    dbMs: 12.1,
    queries: 3,
    clickToSendMs: 3,
    stages: { auth: 2 },
  });
});

test('computeTiming leaves server fields null when the server sent no timing', () => {
  const t = computeTiming({ ...base, status: 0, totalMs: 40, serverTiming: null });
  assert.equal(t.serverMs, null);
  assert.equal(t.networkMs, null);
  assert.equal(t.clickToSendMs, null);
});

test('clickToSendMs measures from the event time stamp and ignores bad values', () => {
  assert.equal(clickToSendMs(1000, 1004.5), 4.5);
  assert.equal(clickToSendMs(undefined, 1000), null);
  assert.equal(clickToSendMs(0, 1000), null);
  assert.equal(clickToSendMs(2000, 1000), null); // event in the future
  assert.equal(clickToSendMs(1000, 60_000), null); // stale event
});

test('summarize gives p50, p95 and max per method and route, ids folded', () => {
  const row = (totalMs: number, path = 'games'): RequestTiming => ({
    ...base,
    path,
    totalMs,
    serverMs: totalMs / 2,
    networkMs: totalMs / 2,
    dbMs: 1,
    queries: 1,
    clickToSendMs: null,
    stages: {},
  });
  const rows = Array.from({ length: 100 }, (_, i) => row(i + 1));
  rows.push(row(5, 'lists/3f2c1a9e-1b2c-4d5e-8f90-abcdefabcdef/queue'));
  rows.push(row(7, 'lists/00000000-1b2c-4d5e-8f90-abcdefabcdef/queue'));
  const out = summarize(rows);
  assert.deepEqual(out['GET games'].totalMs, { p50: 50, p95: 95, max: 100 });
  assert.equal(out['GET games'].n, 100);
  assert.equal(out['GET lists/:id/queue'].n, 2);
  assert.equal(out['GET lists/:id/queue'].totalMs.max, 7);
});

// Fake of the postgres driver: a call returns a lazy thenable that runs only when awaited.
class FakeQuery extends Promise<string> {
  static get [Symbol.species]() {
    return Promise;
  }
}
const lazy = (ms: number) => {
  const q = new FakeQuery((resolve) => void resolve('rows'));
  const then = q.then.bind(q);
  q.then = ((a: never, b: never) => {
    const end = performance.now() + ms;
    while (performance.now() < end); // busy wait: the query "takes" ms
    return then(a, b);
  }) as never;
  return q;
};
const fakeSql = () => {
  const sql = Object.assign(() => lazy(5), {
    begin: async (cb: (tx: unknown) => unknown) => cb(Object.assign(() => lazy(5), {})),
    json: (x: unknown) => x,
  });
  return sql;
};

test('timed counts awaited queries into the request stats', async () => {
  const stats = newTrace(null);
  const sql = timed(fakeSql());
  await traceStore.run(stats, async () => {
    await sql();
    await sql();
  });
  assert.equal(stats.queries, 2);
  assert.ok(stats.dbNs >= 8n * NS, `dbNs was ${stats.dbNs}`);
});

test('timed does not count a fragment that is never awaited', async () => {
  const stats = newTrace(null);
  const sql = timed(fakeSql());
  await traceStore.run(stats, async () => void sql());
  assert.equal(stats.queries, 0);
});

test('timed counts queries inside a transaction and keeps other helpers', async () => {
  const stats = newTrace(null);
  const sql = timed(fakeSql());
  assert.equal(sql.json(1), 1);
  await traceStore.run(stats, () => sql.begin(async (tx: () => Promise<string>) => tx()));
  assert.equal(stats.queries, 1);
});

test('timed keeps two concurrent requests apart', async () => {
  const a = newTrace(null);
  const b = newTrace(null);
  const sql = timed(fakeSql());
  await Promise.all([
    traceStore.run(a, async () => void (await sql())),
    traceStore.run(b, async () => void (await sql(), await sql())),
  ]);
  assert.deepEqual([a.queries, b.queries], [1, 2]);
});

test('timed does nothing outside a request', async () => {
  await timed(fakeSql())();
});
