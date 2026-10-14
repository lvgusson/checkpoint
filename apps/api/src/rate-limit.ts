// Fixed-window in-memory rate limiter.
// shortcut: per-instance counters (serverless instances do not share them); move to a shared
// store if limits must hold globally.
export function createRateLimiter(limit: number, windowMs: number) {
  const windows = new Map<string, { start: number; count: number }>();
  /** Returns true when the call is allowed. */
  return (key: string, now = Date.now()): boolean => {
    if (windows.size > 5000)
      for (const [k, w] of windows) if (now - w.start >= windowMs) windows.delete(k);
    const w = windows.get(key);
    if (!w || now - w.start >= windowMs) {
      windows.set(key, { start: now, count: 1 });
      return true;
    }
    return ++w.count <= limit;
  };
}
