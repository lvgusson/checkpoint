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
  return async <T>(key: string, work: () => Promise<T>): Promise<T> => {
    const release = acquire(key);
    try {
      return await work();
    } finally {
      release();
    }
  };
}
