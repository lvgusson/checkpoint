export interface RequestTiming {
  requestId: string;
  method: string;
  path: string;
  status: number;
  /** Request start in the browser to response received (ms, 3 decimals). */
  totalMs: number;
  /** Server `total` from Server-Timing; null when the server sent none. */
  serverMs: number | null;
  /** totalMs minus serverMs: network, queueing and browser time. */
  networkMs: number | null;
  /** SQL time and query count; null when the server sent no db timing. */
  dbMs: number | null;
  queries: number | null;
  /** Event time stamp to request start, when a DOM event started the request. */
  clickToSendMs: number | null;
  /** Other server stages (recv, auth, route, ser...), only when the server sent detail. */
  stages: Record<string, number>;
}

export function parseServerTiming(header: string | null): Record<string, number> {
  const out: Record<string, number> = {};
  for (const m of (header ?? '').matchAll(/([\w-]+);dur=(-?\d+(?:\.\d+)?)/g))
    out[m[1]] = Number(m[2]);
  return out;
}

const round3 = (n: number) => Math.round(n * 1000) / 1000;

/** `eventTimeStamp` is `window.event.timeStamp`: a click is a few ms old at most, so older means stale. */
export function clickToSendMs(eventTimeStamp: number | undefined, now: number): number | null {
  if (!eventTimeStamp || eventTimeStamp > now || now - eventTimeStamp > 10_000) return null;
  return round3(now - eventTimeStamp);
}

export function computeTiming(input: {
  requestId: string;
  method: string;
  path: string;
  status: number;
  totalMs: number;
  clickToSendMs?: number | null;
  serverTiming: string | null;
}): RequestTiming {
  const { serverTiming, totalMs, clickToSendMs = null, ...rest } = input;
  const { total, db, ...stages } = parseServerTiming(serverTiming);
  const queryCount = /db;dur=[\d.-]+;desc=(\d+)/.exec(serverTiming ?? '');
  const serverMs = total ?? null;
  return {
    ...rest,
    totalMs: round3(totalMs),
    serverMs,
    networkMs: serverMs === null ? null : round3(totalMs - serverMs),
    dbMs: db ?? null,
    queries: queryCount ? Number(queryCount[1]) : null,
    clickToSendMs,
    stages,
  };
}

const BUFFER_SIZE = 100;
const buffer: RequestTiming[] = [];

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
// Nearest-rank percentile on a sorted array.
const pct = (sorted: number[], p: number) =>
  sorted[Math.max(0, Math.ceil((p / 100) * sorted.length) - 1)];

const METRICS = ['totalMs', 'serverMs', 'networkMs', 'dbMs'] as const;
type Stat = { p50: number; p95: number; max: number };
export type TimingSummary = Record<string, { n: number } & Record<(typeof METRICS)[number], Stat>>;

/** p50, p95 and max per `METHOD route` (ids folded to `:id`), over the given timings. */
export function summarize(timings: RequestTiming[]): TimingSummary {
  const groups = new Map<string, RequestTiming[]>();
  for (const t of timings) {
    const key = `${t.method} ${t.path.replace(UUID, ':id')}`;
    groups.set(key, [...(groups.get(key) ?? []), t]);
  }
  const out: TimingSummary = {};
  for (const [key, rows] of groups) {
    const entry = { n: rows.length } as TimingSummary[string];
    for (const m of METRICS) {
      const v = rows
        .map((r) => r[m])
        .filter((x): x is number => x !== null)
        .sort((a, b) => a - b);
      entry[m] = v.length
        ? { p50: pct(v, 50), p95: pct(v, 95), max: v[v.length - 1] }
        : { p50: NaN, p95: NaN, max: NaN };
    }
    out[key] = entry;
  }
  return out;
}

/** Keeps the last 100 timings in `window.__timings`; `window.__timingSummary()` gives p50/p95/max. */
export function recordTiming(timing: RequestTiming) {
  buffer.push(timing);
  if (buffer.length > BUFFER_SIZE) buffer.shift();
  Object.assign(window, { __timings: buffer, __timingSummary: () => summarize(buffer) });
  if (import.meta.env.DEV) console.debug('[timing]', timing);
}
