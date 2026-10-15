// Log destinations (Strategy) and the registry that selects them. Adding a destination means
// writing one LogSink class and registering it; call sites never change.
import { appendFile, mkdir, rename, stat } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { LogEvent, LogSink, SinkKind } from '../../../../packages/core/src/observability.ts';

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
 * exponential backoff (100 ms doubling up to 30 s, 3 attempts per event).
 */
export class SafeSink implements LogSink {
  dropped = 0;
  private queue: { event: LogEvent; attempts: number }[] = [];
  private failures = 0;
  private retryAt = 0;
  private draining: Promise<void> | undefined;
  private timer: NodeJS.Timeout | undefined;
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
    return (this.draining ??= (async () => {
      try {
        while (this.queue.length) {
          const wait = this.retryAt - Date.now();
          if (wait > 0) {
            this.timer ??= setTimeout(() => {
              this.timer = undefined;
              void this.drain();
            }, wait).unref();
            return;
          }
          const item = this.queue[0];
          try {
            await this.inner.write(item.event);
            this.queue.shift();
            this.failures = 0;
          } catch {
            this.retryAt = Date.now() + Math.min(30_000, 100 * 2 ** this.failures++);
            if (++item.attempts >= MAX_ATTEMPTS) {
              this.queue.shift();
              this.dropped++;
            }
          }
        }
      } finally {
        this.draining = undefined;
      }
    })());
  }
  async flush() {
    this.retryAt = 0;
    await this.drain();
    await this.inner.flush?.();
  }
  async close() {
    await this.flush();
    await this.inner.close?.();
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
    // Each fanout member is already a SafeSink; a single sink is wrapped here.
    return kinds.length > 1
      ? createSink('fanout', { env, kinds })
      : new SafeSink(createSink(kinds[0] ?? 'console', { env }));
  } catch (e) {
    // A misconfigured destination must not take the API down; fall back and say so.
    process.stderr.write(`log sink setup failed (${(e as Error).message}); using console\n`);
    return new SafeSink(new ConsoleSink());
  }
}
