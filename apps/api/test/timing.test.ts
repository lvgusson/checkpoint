import { expect, it } from 'vitest';
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

it('clientLatencyMs is arrival minus client stamp', () => {
  expect(clientLatencyMs(1_000_050, '1000000')).toBe(50);
});

it('clientLatencyMs ignores a missing or invalid stamp', () => {
  expect(clientLatencyMs(1_000_050, undefined)).toBe(null);
  expect(clientLatencyMs(1_000_050, 'abc')).toBe(null);
  expect(clientLatencyMs(1_000_050, '-5')).toBe(null);
});

it('detailEnabled needs the env flag or the header, and an authenticated caller', () => {
  expect(detailEnabled('1', undefined, true)).toBe(true);
  expect(detailEnabled(undefined, '1', true)).toBe(true);
  expect(detailEnabled(undefined, undefined, true)).toBe(false);
  expect(detailEnabled('1', '1', false)).toBe(false);
  expect(detailEnabled(undefined, '0', true)).toBe(false);
});

it('serverTimingHeader sends only total and db without detail', () => {
  const t = trace({ dbNs: 1_234_567n, queries: 3, stages: { auth: 2n * NS } });
  expect(serverTimingHeader(t, 12_345_678n, false)).toBe('total;dur=12.346, db;dur=1.235;desc=3');
});

it('serverTimingHeader adds every stage with detail', () => {
  const t = trace({ recvMs: 20, stages: { auth: 2_500_000n, route: 8n * NS, ser: 100_000n } });
  expect(serverTimingHeader(t, 12n * NS, true)).toBe(
    'total;dur=12.000, db;dur=0.000;desc=0, recv;dur=20.000, auth;dur=2.500, route;dur=8.000, ser;dur=0.100',
  );
});

it('stageTable reports stages, db and query count in ms', () => {
  const t = trace({ dbNs: 4n * NS, queries: 2, stages: { route: 9n * NS } });
  expect(stageTable(t, 10n * NS)).toStrictEqual({ total: 10, route: 9, db: 4, dbq: 2 });
});

it('span adds sync and async time to the trace and returns the result', async () => {
  const t = newTrace(null);
  await traceStore.run(t, async () => {
    expect(span('route', () => 7)).toBe(7);
    expect(await span('route', async () => 8)).toBe(8);
    await expect(span('auth', async () => Promise.reject(new Error('x')))).rejects.toThrow();
    expect(() =>
      span('ser', () => {
        throw new Error('y');
      }),
    ).toThrow();
  });
  expect(Object.keys(t.stages).sort()).toStrictEqual(['auth', 'route', 'ser']);
});

it('span outside a request just runs the function', () => {
  expect(span('route', () => 1)).toBe(1);
});

it('parseServerTiming reads the header produced by the server', () => {
  const header = serverTimingHeader(trace({ stages: { auth: NS } }), 5n * NS, true);
  expect(parseServerTiming(header)).toStrictEqual({ total: 5, db: 0, auth: 1 });
  expect(parseServerTiming(null)).toStrictEqual({});
});

const base = { requestId: 'r', method: 'GET', path: 'games', status: 200 };

it('computeTiming splits browser total into server total and network', () => {
  const t = computeTiming({
    ...base,
    totalMs: 100.4567,
    clickToSendMs: 3,
    serverTiming: 'total;dur=30.250, db;dur=12.100;desc=3, auth;dur=2.000',
  });
  expect(t).toStrictEqual({
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

it('computeTiming leaves server fields null when the server sent no timing', () => {
  const t = computeTiming({ ...base, status: 0, totalMs: 40, serverTiming: null });
  expect(t.serverMs).toBe(null);
  expect(t.networkMs).toBe(null);
  expect(t.clickToSendMs).toBe(null);
});

it('clickToSendMs measures from the event time stamp and ignores bad values', () => {
  expect(clickToSendMs(1000, 1004.5)).toBe(4.5);
  expect(clickToSendMs(undefined, 1000)).toBe(null);
  expect(clickToSendMs(0, 1000)).toBe(null);
  expect(clickToSendMs(2000, 1000)).toBe(null); // event in the future
  expect(clickToSendMs(1000, 60_000)).toBe(null); // stale event
});

it('summarize gives p50, p95 and max per method and route, ids folded', () => {
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
  expect(out['GET games'].totalMs).toStrictEqual({ p50: 50, p95: 95, max: 100 });
  expect(out['GET games'].n).toBe(100);
  expect(out['GET lists/:id/queue'].n).toBe(2);
  expect(out['GET lists/:id/queue'].totalMs.max).toBe(7);
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
    begin: async (cb: (tx: () => FakeQuery) => unknown) => cb(Object.assign(() => lazy(5), {})),
    json: (x: unknown) => x,
  });
  return sql;
};

it('timed counts awaited queries into the request stats', async () => {
  const stats = newTrace(null);
  const sql = timed(fakeSql());
  await traceStore.run(stats, async () => {
    await sql();
    await sql();
  });
  expect(stats.queries).toBe(2);
  expect(stats.dbNs >= 8n * NS, `dbNs was ${stats.dbNs}`).toBeTruthy();
});

it('timed does not count a fragment that is never awaited', async () => {
  const stats = newTrace(null);
  const sql = timed(fakeSql());
  await traceStore.run(stats, async () => void sql());
  expect(stats.queries).toBe(0);
});

it('timed counts queries inside a transaction and keeps other helpers', async () => {
  const stats = newTrace(null);
  const sql = timed(fakeSql());
  expect(sql.json(1)).toBe(1);
  await traceStore.run(stats, () => sql.begin(async (tx) => tx()));
  expect(stats.queries).toBe(1);
});

it('timed keeps two concurrent requests apart', async () => {
  const a = newTrace(null);
  const b = newTrace(null);
  const sql = timed(fakeSql());
  await Promise.all([
    traceStore.run(a, async () => void (await sql())),
    traceStore.run(b, async () => void (await sql(), await sql())),
  ]);
  expect([a.queries, b.queries]).toStrictEqual([1, 2]);
});

it('timed does nothing outside a request', async () => {
  await timed(fakeSql())();
});
