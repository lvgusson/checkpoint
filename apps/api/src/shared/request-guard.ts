import { createRateLimiter } from '../auth/rate-limit.ts';
import { AppError } from './errors.ts';

/** Private stores share identity and foreign keys. JSON supports one local user only. */
export function assertPrivateStores(
  stores: Record<string, 'pg' | 'json'>,
  authenticated: boolean,
): void {
  const privateStores = [
    'GAMES_STORE',
    'LISTS_STORE',
    'PINS_STORE',
    'SCORING_STORE',
    'APP_USERS_STORE',
  ];
  const selected = privateStores.map((name) => stores[name]);
  if (selected.some((kind) => kind !== selected[0]))
    throw new Error('Private stores must use the same driver');
  if (authenticated && selected.some((kind) => kind !== 'pg'))
    throw new Error('Authenticated operation requires PostgreSQL for every private store');
}

/** shortcut: counters apply per process; use a shared store for limits across instances. */
export function createRequestAdmission(limit: number, windowMs: number, maxConcurrent = 1) {
  const allow = createRateLimiter(limit, windowMs);
  const active = new Map<string, number>();
  return (key: string): (() => void) => {
    if (!allow(key) || (active.get(key) ?? 0) >= maxConcurrent)
      throw new AppError('Muitas operações. Tente novamente mais tarde', 429, {
        'Retry-After': String(Math.ceil(windowMs / 1000)),
      });
    active.set(key, (active.get(key) ?? 0) + 1);
    let released = false;
    return () => {
      if (released) return;
      released = true;
      const remaining = active.get(key)! - 1;
      if (remaining) active.set(key, remaining);
      else active.delete(key);
    };
  };
}

export function createRequestGuard(limit: number, windowMs: number, maxConcurrent = 1) {
  const acquire = createRequestAdmission(limit, windowMs, maxConcurrent);
  const inFlight = new Map<string, Promise<unknown>>();
  return async <T>(key: string, work: () => Promise<T>, coalesce = false): Promise<T> => {
    if (coalesce) {
      const active = inFlight.get(key);
      if (active) return active as Promise<T>;
    }
    const release = acquire(key);
    const promise = (async () => {
      try {
        return await work();
      } finally {
        release();
      }
    })();
    if (coalesce) {
      inFlight.set(key, promise);
      const clean = () => inFlight.delete(key);
      promise.then(clean, clean);
    }
    return promise;
  };
}

/** Request deadline in ms. Read per call so tests and operators can change it. */
export const requestDeadlineMs = () => Number(process.env.API_DEADLINE_MS) || 15_000;

/**
 * Rejects with 504 when `work` does not settle in time. The work itself is not cancelled,
 * but the caller (and any guard slot or coalesced entry around it) is released.
 */
export function withDeadline<T>(ms: number, work: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new AppError('Tempo de resposta esgotado', 504)), ms);
    work().then(
      (value) => (clearTimeout(timer), resolve(value)),
      (error) => (clearTimeout(timer), reject(error)),
    );
  });
}
