// Observability facade: `import { log } from './logger.ts'`, then log.info('event.name', fields).
// Events are redacted here, before any sink sees them; the destination is chosen by LOG_SINK
// (see observability/README.md). Nothing here throws into the request path.
import type {
  Attributes,
  ErrorReporter,
  LogLevel,
  LogSink,
  MetricsRecorder,
  Tracer,
} from '../../../packages/core/src/observability.ts';
import { getContext } from './context.ts';
import { createSinkFromEnv } from './observability/sinks.ts';

const SENSITIVE_KEY =
  /token|authorization|password|passwd|secret|api[-_]?key|cookie|credential|jwt|session|bearer|refresh/i;
const SENSITIVE_VALUE =
  /(bearer\s+|[?&](?:access_token|apikey|api_key|token|refresh_token)=)[^\s&"]+/gi;
const LEVELS: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

const scrub = (text: string) => {
  const clean = text.replace(SENSITIVE_VALUE, '$1[redacted]');
  return clean.length > 2000 ? clean.slice(0, 2000) + '…' : clean;
};

/** Copies a value for logging: sensitive keys and token-like strings are masked, depth is bounded. */
export function redact(value: unknown, depth = 0): unknown {
  if (typeof value === 'string') return scrub(value);
  if (value === null || typeof value !== 'object') return value;
  if (value instanceof Date) return value.toISOString();
  if (depth >= 5) return '[truncated]';
  if (value instanceof Error)
    return {
      name: value.name,
      message: scrub(value.message),
      stack: value.stack && scrub(value.stack),
      cause: value.cause === undefined ? undefined : redact(value.cause, depth + 1),
    };
  if (value instanceof Map) return redact(Object.fromEntries(value), depth);
  if (value instanceof Set) return redact([...value], depth);
  if (Array.isArray(value)) return value.slice(0, 50).map((v) => redact(v, depth + 1));
  return Object.fromEntries(
    Object.entries(value).map(([k, v]) => [
      k,
      SENSITIVE_KEY.test(k) ? '[redacted]' : redact(v, depth + 1),
    ]),
  );
}

let sink: LogSink = createSinkFromEnv();
const configured = process.env.LOG_LEVEL as LogLevel | undefined;
const threshold = LEVELS[configured && configured in LEVELS ? configured : 'info'];

/** Replaces the destination (tests, vendor adapters). */
export function setSink(next: LogSink): void {
  sink = next;
}
export const flushLogs = async () => {
  try {
    await sink.flush?.();
  } catch {
    // Flushing is best effort.
  }
};

function emit(level: LogLevel, event: string, fields: Attributes = {}): void {
  if (LEVELS[level] < threshold) return;
  try {
    const ctx = getContext();
    const { requestId, userId, ...rest } = fields;
    sink.write({
      time: new Date().toISOString(),
      level,
      event,
      requestId: ctx?.requestId ?? (typeof requestId === 'string' ? requestId : undefined),
      userId: ctx?.userId ?? (typeof userId === 'string' ? userId : undefined),
      fields: redact(rest) as Attributes,
    });
  } catch {
    // A broken sink must never fail a request.
  }
}

export interface Log {
  log(level: LogLevel, event: string, fields?: Attributes): void;
  debug(event: string, fields?: Attributes): void;
  info(event: string, fields?: Attributes): void;
  warn(event: string, fields?: Attributes): void;
  error(event: string, fields?: Attributes): void;
  /** Logger that adds `bound` to every event. requestId and userId always come from the request context. */
  child(bound: Attributes): Log;
}

function makeLog(bound: Attributes): Log {
  const at = (level: LogLevel) => (event: string, fields?: Attributes) =>
    emit(level, event, { ...bound, ...fields });
  return {
    log: (level, event, fields) => emit(level, event, { ...bound, ...fields }),
    debug: at('debug'),
    info: at('info'),
    warn: at('warn'),
    error: at('error'),
    child: (more) => makeLog({ ...bound, ...more }),
  };
}

export const log = makeLog({});
/** Alias kept for existing call sites. */
export const logger = log;

// Error reporting, metrics and tracing default to the same sink; a vendor adapter can replace them.
let errorReporter: ErrorReporter = {
  report: (error, { event, ...attributes } = {}) =>
    log.error(typeof event === 'string' ? event : 'error.reported', { ...attributes, error }),
};
let metricsRecorder: MetricsRecorder = {
  count: (name, value = 1, attributes) =>
    log.debug('metric', { ...attributes, kind: 'count', name, value }),
  timing: (name, ms, attributes) =>
    log.debug('metric', { ...attributes, kind: 'timing', name, ms }),
};
let spanTracer: Tracer = {
  startSpan(name, attributes) {
    const started = performance.now();
    const spanFields: Attributes = { ...attributes };
    return {
      setAttributes: (a) => Object.assign(spanFields, a),
      end: (error) =>
        log.debug('span', {
          ...spanFields,
          name,
          ms: Math.round(performance.now() - started),
          error,
        }),
    };
  },
};
export function setObservability(next: {
  errors?: ErrorReporter;
  metrics?: MetricsRecorder;
  tracer?: Tracer;
}): void {
  errorReporter = next.errors ?? errorReporter;
  metricsRecorder = next.metrics ?? metricsRecorder;
  spanTracer = next.tracer ?? spanTracer;
}
export const errors: ErrorReporter = { report: (e, a) => errorReporter.report(e, a) };
export const metrics: MetricsRecorder = {
  count: (n, v, a) => metricsRecorder.count(n, v, a),
  timing: (n, ms, a) => metricsRecorder.timing(n, ms, a),
};
export const tracer: Tracer = { startSpan: (n, a) => spanTracer.startSpan(n, a) };
