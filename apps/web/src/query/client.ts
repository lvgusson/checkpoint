import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query';
import { isApiError } from '../api/errors';
import { reportError } from './errors';

// One-time cleanup of the localStorage entries left by the old Angular DataCache.
try {
  for (let i = localStorage.length - 1; i >= 0; i--) {
    const key = localStorage.key(i);
    if (key?.startsWith('checkpoint:cache:') || key?.startsWith('checkpoint:scoring-settings:'))
      localStorage.removeItem(key);
  }
} catch {
  // Storage unavailable: nothing to clean.
}

/** Same freshness window as the Angular DataCache (FRESH_MS). */
export const FRESH_MS = 60_000;

/**
 * Single retry owner for reads: up to 2 retries with backoff, only for transient failures.
 * Mutations never retry (no blind replay of writes).
 */
const shouldRetry = (count: number, error: unknown) =>
  count < 2 && isApiError(error) && error.retryable;

export const queryClient = new QueryClient({
  queryCache: new QueryCache({
    // Initial load failures belong to the screen (ErrorState); background refetch failures are global.
    onError: (error, query) => query.state.data !== undefined && reportError(error),
  }),
  mutationCache: new MutationCache({
    onError: (error, _vars, _ctx, mutation) => !mutation.options.onError && reportError(error),
  }),
  defaultOptions: {
    queries: {
      staleTime: FRESH_MS,
      gcTime: 10 * 60_000,
      retry: shouldRetry,
      refetchOnWindowFocus: false,
    },
    mutations: { retry: false },
  },
});
