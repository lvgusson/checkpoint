import type { QueryClient, QueryKey } from '@tanstack/react-query';

/** How far ahead to warm the cache. Pluggable: pass your own object to `useDataCollection`. */
export interface PrefetchPolicy {
  /** Pages to prefetch after the current one. Default 1. */
  aheadPages: number;
  /** Maximum prefetches in flight at once. Default 2. */
  maxConcurrency: number;
  /** Skip all prefetching when the user asked for reduced data (navigator.connection.saveData). Default true. */
  respectSaveData: boolean;
}

export const defaultPrefetchPolicy: PrefetchPolicy = {
  aheadPages: 1,
  maxConcurrency: 2,
  respectSaveData: true,
};

export const isSaveData = () =>
  (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData === true;

export interface PrefetchJob {
  key: QueryKey;
  /** Receives a signal aborted by `cancel()` (identity or filter change). */
  fetch: (signal: AbortSignal) => Promise<unknown>;
}

/**
 * Runs prefetch jobs through `queryClient.prefetchQuery` (so results land in the shared cache and
 * already-fresh keys are skipped) with bounded concurrency. `cancel()` drops queued jobs and aborts
 * running ones, except those a real observer (a mounted screen) has since joined.
 */
export class PrefetchScheduler {
  private queue: PrefetchJob[] = [];
  private running = new Map<PrefetchJob, AbortController>();
  private cancelled = false;

  constructor(
    private queryClient: QueryClient,
    private maxConcurrency: number,
  ) {}

  enqueue(jobs: PrefetchJob[]) {
    if (this.cancelled) return;
    this.queue.push(...jobs);
    this.pump();
  }

  cancel() {
    this.cancelled = true;
    this.queue = [];
    for (const [job, controller] of this.running) {
      const observers =
        this.queryClient
          .getQueryCache()
          .find({ queryKey: job.key, exact: true })
          ?.getObserversCount() ?? 0;
      if (observers === 0) controller.abort();
    }
  }

  private pump() {
    while (this.running.size < this.maxConcurrency && this.queue.length && !this.cancelled) {
      const job = this.queue.shift()!;
      const controller = new AbortController();
      this.running.set(job, controller);
      void this.queryClient
        .prefetchQuery({ queryKey: job.key, queryFn: () => job.fetch(controller.signal) })
        .finally(() => {
          this.running.delete(job);
          this.pump();
        });
    }
  }
}
