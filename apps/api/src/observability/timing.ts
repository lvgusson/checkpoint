import { AsyncLocalStorage } from 'node:async_hooks';

/** Client stamp (epoch ms, header X-Client-Sent-At) to server arrival. Includes clock skew. */
export function clientLatencyMs(arrivalEpochMs: number, header: string | undefined): number | null {
  if (!header || !/^\d{1,15}$/.test(header)) return null;
  return Math.round(arrivalEpochMs - Number(header));
}

/**
 * One trace per request, in ns from `process.hrtime.bigint()`. The pool is shared, so the request
 * context (AsyncLocalStorage) must own the numbers.
 * Stages: recv (client to server), auth, route (dispatch), ser (JSON.stringify), send (write);
 * db and dbq come from `timed()`. Stages not listed here are free to add with `span`.
 */
export interface Trace {
  t0: bigint;
  /** Browser to server in ms from X-Client-Sent-At (ms precision, includes clock skew). */
  recvMs: number | null;
  stages: Record<string, bigint>;
  dbNs: bigint;
  queries: number;
  /** True once the caller passed authentication (or the server runs without auth in dev). */
  authed: boolean;
}

export const traceStore = new AsyncLocalStorage<Trace>();

export const newTrace = (recvMs: number | null): Trace => ({
  t0: process.hrtime.bigint(),
  recvMs,
  stages: {},
  dbNs: 0n,
  queries: 0,
  authed: false,
});

const add = (trace: Trace | undefined, name: string, start: bigint) => {
  if (trace) trace.stages[name] = (trace.stages[name] ?? 0n) + (process.hrtime.bigint() - start);
};

/** Times `fn` into stage `name` of the current request. Sync and async. Outside a request it only runs `fn`. */
export function span<T>(name: string, fn: () => T): T {
  const trace = traceStore.getStore();
  if (!trace) return fn();
  const start = process.hrtime.bigint();
  let out: T;
  try {
    out = fn();
  } catch (e) {
    add(trace, name, start);
    throw e;
  }
  if (!(out instanceof Promise)) return (add(trace, name, start), out);
  return out.finally(() => add(trace, name, start)) as T;
}

/**
 * Wraps the postgres client so each awaited query adds its time to the current request.
 * A query runs only when awaited, so unawaited fragments (`sql\`AND x\``) are not counted.
 * Queries inside `begin` are counted too. Calls outside a request are ignored.
 * shortcut: `.execute()`, `.values()` and cursors skip `then`, so they are not timed; none is used today.
 */
export function timed<T extends object>(sql: T): T {
  return new Proxy(sql, {
    apply(target, thisArg, args) {
      const query = Reflect.apply(target as never, thisArg, args);
      if (!(query instanceof Promise)) return query;
      const then = query.then.bind(query);
      query.then = (onOk: never, onFail: never) => {
        const trace = traceStore.getStore();
        const start = process.hrtime.bigint();
        const end = () => {
          if (!trace) return;
          trace.dbNs += process.hrtime.bigint() - start;
          trace.queries++;
        };
        return then(
          (v: unknown) => (end(), v),
          (e: unknown) => {
            end();
            throw e;
          },
        ).then(onOk, onFail);
      };
      return query;
    },
    get(target, prop) {
      if (prop === 'begin')
        return (...args: unknown[]) => {
          const cb = args.at(-1);
          if (typeof cb === 'function') args[args.length - 1] = (tx: object) => cb(timed(tx));
          return (target as never as Record<string, (...a: unknown[]) => unknown>).begin(...args);
        };
      return Reflect.get(target, prop, target);
    },
  });
}

const ms = (ns: bigint) => (Number(ns) / 1e6).toFixed(3);

/** Stage detail is internal data: only authenticated callers who ask for it (or an env flag) get it. */
export const detailEnabled = (
  env: string | undefined,
  header: string | undefined,
  authed: boolean,
) => authed && (env === '1' || header === '1');

/** Server-Timing value. Always `total` and `db` (`desc` is the query count); stages only with detail. */
export function serverTimingHeader(trace: Trace, nowNs: bigint, detail: boolean): string {
  const parts = [
    `total;dur=${ms(nowNs - trace.t0)}`,
    `db;dur=${ms(trace.dbNs)};desc=${trace.queries}`,
  ];
  if (detail) {
    if (trace.recvMs !== null) parts.push(`recv;dur=${trace.recvMs.toFixed(3)}`);
    for (const [name, ns] of Object.entries(trace.stages)) parts.push(`${name};dur=${ms(ns)}`);
  }
  return parts.join(', ');
}

/** Whole stage table in ms for the request log line. */
export function stageTable(trace: Trace, nowNs: bigint): Record<string, number> {
  const out: Record<string, number> = { total: Number(ms(nowNs - trace.t0)) };
  if (trace.recvMs !== null) out.recv = trace.recvMs;
  for (const [name, ns] of Object.entries(trace.stages)) out[name] = Number(ms(ns));
  out.db = Number(ms(trace.dbNs));
  out.dbq = trace.queries;
  return out;
}
