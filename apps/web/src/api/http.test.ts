import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, isApiError } from './http';
import { authSession } from '../auth/session';

describe('HTTP client auth resilience', () => {
  beforeEach(() => {
    vi.stubGlobal('location', { origin: 'http://localhost:5173' });
    vi.stubGlobal('window', { event: undefined });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('times out and converts to 408 ApiError when auth token resolution hangs', async () => {
    vi.spyOn(authSession, 'enabled', 'get').mockReturnValue(true);
    // Never-resolving auth promise
    vi.spyOn(authSession, 'accessToken').mockReturnValue(new Promise(() => {}));

    const start = Date.now();
    await expect(api.get('games', { timeout: 50 })).rejects.toSatisfy((err: unknown) => {
      return isApiError(err) && err.status === 408;
    });
    expect(Date.now() - start).toBeLessThan(1000);
  });

  it('respects abort signal while waiting for auth token', async () => {
    vi.spyOn(authSession, 'enabled', 'get').mockReturnValue(true);
    vi.spyOn(authSession, 'accessToken').mockReturnValue(new Promise(() => {}));

    const controller = new AbortController();
    setTimeout(() => controller.abort(), 20);

    await expect(api.get('games', { signal: controller.signal })).rejects.toSatisfy(
      (err: unknown) => {
        return err instanceof DOMException && err.name === 'AbortError';
      },
    );
  });
});
