/** One tracked event, in the shape the POST /api/v1/track body expects. */
export interface TrackEvent {
  kind: 'page_view' | 'click';
  screen: string;
  element?: string;
  occurredAt: string;
}

export interface TrackQueueOptions {
  /** Sends one batch. A returned promise that rejects, or a throw, counts as a failed attempt. */
  send: (events: TrackEvent[]) => unknown;
  /** Oldest events are dropped above this size. */
  cap?: number;
  /** Maximum events per send call. */
  batch?: number;
}

const FLUSH_INTERVAL_MS = 5_000;
const ATTEMPTS = 2; // one send plus one retry

/**
 * In-memory event buffer. Pure: no browser globals at import time.
 * Sends never block the caller and never throw out of push or flush.
 */
export function createTrackQueue({ send, cap = 200, batch = 50 }: TrackQueueOptions) {
  let buffer: TrackEvent[] = [];
  let timer: ReturnType<typeof setInterval> | undefined;

  /** Fire and forget. A failed attempt is retried once, then the batch is dropped. */
  function deliver(events: TrackEvent[], attemptsLeft: number): void {
    const retry = () => {
      if (attemptsLeft > 1) deliver(events, attemptsLeft - 1);
    };
    try {
      Promise.resolve(send(events)).catch(retry);
    } catch {
      retry();
    }
  }

  function stop(): void {
    if (timer === undefined) return;
    clearInterval(timer);
    timer = undefined;
  }

  function flush(): void {
    while (buffer.length > 0) deliver(buffer.splice(0, batch), ATTEMPTS);
    stop();
  }

  function push(event: TrackEvent): void {
    buffer.push(event);
    if (buffer.length > cap) buffer = buffer.slice(buffer.length - cap);
    timer ??= setInterval(flush, FLUSH_INTERVAL_MS);
  }

  return { push, flush, size: () => buffer.length };
}
