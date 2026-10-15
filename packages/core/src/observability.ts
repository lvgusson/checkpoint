// Vendor-neutral observability contracts. Implementations live in the apps; nothing here
// may import a vendor SDK.
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export type Attributes = Record<string, unknown>;

export interface Logger {
  log(level: LogLevel, message: string, attributes?: Attributes): void;
}

export interface ErrorReporter {
  report(error: unknown, attributes?: Attributes): void;
}

export interface MetricsRecorder {
  count(name: string, value?: number, attributes?: Attributes): void;
  timing(name: string, milliseconds: number, attributes?: Attributes): void;
}

export interface Span {
  setAttributes(attributes: Attributes): void;
  end(error?: unknown): void;
}

export interface Tracer {
  startSpan(name: string, attributes?: Attributes): Span;
}

/** Built-in destinations. Registering a new one adds its name here and a factory in the API registry. */
export type SinkKind = 'console' | 'file' | 'memory' | 'noop' | 'fanout';

/** A structured event, already redacted when a sink receives it. */
export interface LogEvent {
  time: string;
  level: LogLevel;
  /** Stable machine-readable event name, for example `request` or `reorder.persist_failed`. */
  event: string;
  requestId?: string;
  userId?: string;
  fields: Attributes;
}

/** Strategy for where log events are stored. Implementations may throw or reject. */
export interface LogSink {
  write(event: LogEvent): void | Promise<void>;
  flush?(): void | Promise<void>;
  close?(): void | Promise<void>;
}
