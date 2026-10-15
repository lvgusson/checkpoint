// Log destinations (Strategy) and the registry that selects them. Adding a destination means
// writing one LogSink class and registering it; call sites never change.
import { appendFile, mkdir, rename, stat } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { LogEvent, LogSink, SinkKind } from '../../../../packages/core/src/observability.ts';
import { db } from '../data/db.ts';
import type { DatabaseLogRow } from './types.ts';

type Env = Record<string, string | undefined>;

/** One JSON line. Reserved keys are written last so event fields can never override them. */
export const toJsonLine = (e: LogEvent) =>
  JSON.stringify({
    ...e.fields,
    time: e.time,
    level: e.level,
    event: e.event,
    requestId: e.requestId,
    userId: e.userId,
  });

export class NoopSink implements LogSink {
  write() {}
}

/** JSON lines on stdout (stderr for errors). */
export class ConsoleSink implements LogSink {
  write(e: LogEvent) {
    (e.level === 'error' ? process.stderr : process.stdout).write(toJsonLine(e) + '\n');
  }
}

/** Ring buffer, mainly for tests. */
export class MemorySink implements LogSink {
  events: LogEvent[] = [];
  private capacity: number;
  constructor(capacity = 1000) {
    this.capacity = capacity;
  }
  write(e: LogEvent) {
    if (this.events.push(e) > this.capacity) this.events.shift();
  }
  clear() {
    this.events = [];
  }
}

/**
 * Append-only JSON lines. When the file would exceed `maxBytes` it is moved to `<path>.1`
 * (replacing the previous one), so disk use is bounded by about 2 x maxBytes.
 */
export class FileSink implements LogSink {
  private size: number | undefined;
  private rotationWarned = false;
  private path: string;
  private maxBytes: number;
  constructor(path: string, maxBytes = 10 * 1024 * 1024) {
    this.path = path;
    this.maxBytes = maxBytes;
  }
  async write(e: LogEvent) {
    const line = toJsonLine(e) + '\n';
    if (this.size === undefined) {
      await mkdir(dirname(this.path), { recursive: true });
      this.size = await stat(this.path).then(
        (s) => s.size,
        () => 0,
      );
    }
    const bytes = Buffer.byteLength(line);
    if (this.size + bytes > this.maxBytes) {
      try {
        await rename(this.path, this.path + '.1');
        this.size = 0;
      } catch (e) {
        if (!this.rotationWarned) {
          this.rotationWarned = true;
          process.stderr.write(`log file rotation failed: ${(e as Error).message}\n`);
        }
      }
    }
    await appendFile(this.path, line);
    this.size += bytes;
  }
}

/** Sends every event to every sink; a sink that fails does not affect the others. */
export class FanoutSink implements LogSink {
  private sinks: LogSink[];
  constructor(sinks: LogSink[]) {
    this.sinks = sinks;
  }
  write(e: LogEvent) {
    for (const s of this.sinks)
      void Promise.resolve()
        .then(() => s.write(e))
        .catch(() => {});
  }
  async flush() {
    await Promise.allSettled(this.sinks.map((s) => s.flush?.()));
  }
  async close() {
    await Promise.allSettled(this.sinks.map((s) => s.close?.()));
  }
}

const MAX_ATTEMPTS = 3;

/**
 * Makes any sink safe for the request path: write() never throws or waits; events go through a
 * bounded queue (oldest dropped first, counted in `dropped`) and a failing sink is retried with
 * exponential backoff (100 ms, then 200 ms, 3 attempts per event).
 */
export class SafeSink implements LogSink {
  dropped = 0;
  private queue: { event: LogEvent; attempts: number }[] = [];
  private flushing = false;
  private draining: Promise<void> | undefined;
  private inner: LogSink;
  private maxQueue: number;
  constructor(inner: LogSink, maxQueue = 1000) {
    this.inner = inner;
    this.maxQueue = maxQueue;
  }
  write(event: LogEvent) {
    if (this.queue.length >= this.maxQueue) {
      this.queue.shift();
      this.dropped++;
    }
    this.queue.push({ event, attempts: 0 });
    void this.drain();
  }
  private drain(): Promise<void> {
    return (this.draining ??= Promise.resolve().then(async () => {
      try {
        while (this.queue.length) {
          // The active event is outside the waiting queue, so overflow cannot remove it.
          const item = this.queue.shift()!;
          for (;;) {
            try {
              await this.inner.write(item.event);
              break;
            } catch {
              if (++item.attempts >= MAX_ATTEMPTS) {
                this.dropped++;
                break;
              }
              if (!this.flushing)
                await new Promise((resolve) => setTimeout(resolve, 100 * 2 ** (item.attempts - 1)));
            }
          }
        }
      } finally {
        this.draining = undefined;
      }
    }));
  }
  async flush() {
    this.flushing = true;
    try {
      await this.drain();
      await this.inner.flush?.();
    } finally {
      this.flushing = false;
    }
  }
  async close() {
    await this.flush();
    await this.inner.close?.();
  }
}

/** Extracts the function name from a V8 stack trace. */
export function extractFunctionName(stack?: string | null): string | null {
  if (!stack) return null;
  const lines = stack.split('\n');
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]?.trim();
    if (!line) continue;
    const matchNamed = line.match(/^at\s+(?:async\s+)?([^\s(]+)\s*\(/);
    if (matchNamed && matchNamed[1]) {
      return matchNamed[1];
    }
    if (/^at\s+/.test(line)) {
      return 'anonymous';
    }
  }
  return null;
}

/** Formats a LogEvent into a DatabaseLogRow suitable for public.logs table. */
export function formatDatabaseLogRow(e: LogEvent): DatabaseLogRow {
  const fields = e.fields ?? {};
  const errorObj =
    fields.error && typeof fields.error === 'object' && !Array.isArray(fields.error)
      ? (fields.error as Record<string, unknown>)
      : null;

  const stack =
    (typeof fields.stack === 'string' && fields.stack) ||
    (typeof errorObj?.stack === 'string' && (errorObj.stack as string)) ||
    null;

  const function_name =
    (typeof fields.function_name === 'string' && fields.function_name) ||
    (typeof fields.functionName === 'string' && fields.functionName) ||
    (typeof errorObj?.function_name === 'string' && (errorObj.function_name as string)) ||
    (typeof errorObj?.functionName === 'string' && (errorObj.functionName as string)) ||
    extractFunctionName(stack);

  const message =
    (typeof fields.message === 'string' && fields.message) ||
    (typeof errorObj?.message === 'string' && (errorObj.message as string)) ||
    (typeof fields.error === 'string' && fields.error) ||
    e.event;

  const request_id =
    e.requestId ??
    (typeof fields.requestId === 'string' ? fields.requestId : null) ??
    (typeof fields.request_id === 'string' ? fields.request_id : null);

  const user_id =
    e.userId ??
    (typeof fields.userId === 'string' ? fields.userId : null) ??
    (typeof fields.user_id === 'string' ? fields.user_id : null);

  let payload: Record<string, unknown> | null = null;
  if (fields.payload && typeof fields.payload === 'object' && !Array.isArray(fields.payload)) {
    payload = fields.payload as Record<string, unknown>;
  } else if (fields.payload !== undefined && fields.payload !== null) {
    payload = { value: fields.payload };
  } else if (
    errorObj?.payload &&
    typeof errorObj.payload === 'object' &&
    !Array.isArray(errorObj.payload)
  ) {
    payload = errorObj.payload as Record<string, unknown>;
  } else {
    const rest = { ...fields };
    delete rest.message;
    delete rest.stack;
    delete rest.function_name;
    delete rest.functionName;
    delete rest.requestId;
    delete rest.userId;
    delete rest.request_id;
    delete rest.user_id;
    if (Object.keys(rest).length > 0) {
      payload = rest;
    }
  }

  return {
    level: e.level,
    event: e.event,
    function_name,
    message,
    stack,
    request_id,
    user_id,
    payload,
  };
}

/**
 * Persists error-level and unhandled error logs to the Supabase `public.logs` table.
 * Operations are non-blocking and caught so DB failures never affect the request path.
 */
export class DatabaseSink implements LogSink {
  private url: string | undefined;
  private pending = new Set<Promise<void>>();

  constructor(url = process.env.DATABASE_URL) {
    this.url = url;
  }

  async write(e: LogEvent): Promise<void> {
    if (e.level !== 'error' && !e.event.includes('unhandled_error')) return;
    const dbUrl = this.url ?? process.env.DATABASE_URL;
    if (!dbUrl) return;

    const op = this.persist(e, dbUrl);
    this.pending.add(op);
    try {
      await op;
    } finally {
      this.pending.delete(op);
    }
  }

  private async persist(e: LogEvent, dbUrl: string): Promise<void> {
    try {
      const sql = db(dbUrl);
      const row = formatDatabaseLogRow(e);
      await sql`
        INSERT INTO public.logs (
          level,
          event,
          function_name,
          message,
          stack,
          request_id,
          user_id,
          payload
        ) VALUES (
          ${row.level},
          ${row.event},
          ${row.function_name ?? null},
          ${row.message ?? null},
          ${row.stack ?? null},
          ${row.request_id ?? null},
          ${row.user_id ?? null},
          ${row.payload ? sql.json(row.payload as never) : null}
        )
      `;
    } catch {
      // Non-blocking / caught so logging failures never cause requests to fail.
    }
  }

  async flush(): Promise<void> {
    if (this.pending.size > 0) {
      await Promise.allSettled([...this.pending]);
    }
  }
}

export interface SinkOptions {
  env?: Env;
  /** `fanout` only: the kinds to combine. */
  kinds?: string[];
}

type SinkFactory = (options: SinkOptions) => LogSink;

const registry = new Map<string, SinkFactory>();

/** Registers a destination under a name usable in LOG_SINK. */
export function registerSink(kind: string, factory: SinkFactory) {
  registry.set(kind, factory);
}

export function createSink(kind: SinkKind | (string & {}), options: SinkOptions = {}): LogSink {
  const factory = registry.get(kind);
  if (!factory) throw new Error(`Unknown log sink "${kind}"`);
  return factory(options);
}

registerSink('console', () => new ConsoleSink());
registerSink('noop', () => new NoopSink());
registerSink('memory', () => new MemorySink());
registerSink('db', ({ env = {} }) => new DatabaseSink(env.DATABASE_URL));
registerSink('postgres', ({ env = {} }) => new DatabaseSink(env.DATABASE_URL));
registerSink('database', ({ env = {} }) => new DatabaseSink(env.DATABASE_URL));
registerSink(
  'file',
  ({ env = {} }) =>
    new FileSink(env.LOG_FILE || 'logs/api.log', Number(env.LOG_FILE_MAX_BYTES) || undefined),
);
registerSink('fanout', (o) => {
  const kinds = (o.kinds ?? []).filter((k) => k !== 'fanout');
  if (!kinds.length) throw new Error('fanout needs at least one non-fanout sink');
  return new FanoutSink(kinds.map((k) => new SafeSink(createSink(k, o))));
});

/** Sink selected by LOG_SINK (default `console`; a comma list fans out). Never throws. */
export function createSinkFromEnv(env: Env = process.env): LogSink {
  const kinds = (env.LOG_SINK ?? 'console')
    .split(',')
    .map((k) => k.trim())
    .filter((k) => k && k !== 'fanout');
  try {
    const sinks: LogSink[] = [];
    for (const kind of kinds) {
      sinks.push(new SafeSink(createSink(kind, { env })));
    }
    const hasDbSink = kinds.some((k) => k === 'db' || k === 'postgres' || k === 'database');
    if (env.DATABASE_URL && !hasDbSink && !kinds.includes('noop')) {
      sinks.push(new SafeSink(new DatabaseSink(env.DATABASE_URL)));
    }
    if (sinks.length === 1) return sinks[0]!;
    if (sinks.length > 1) return new FanoutSink(sinks);
    return new SafeSink(new ConsoleSink());
  } catch (e) {
    // A misconfigured destination must not take the API down; fall back and say so.
    process.stderr.write(`log sink setup failed (${(e as Error).message}); using console\n`);
    return new SafeSink(new ConsoleSink());
  }
}
