import ky, { isHTTPError, isTimeoutError, type Options } from 'ky';
import { authSession } from '../auth/session';
import { ApiError, toApiError } from './errors';
import { clickToSendMs, computeTiming, recordTiming } from './timing';

export { ApiError, isApiError } from './errors';

const API_BASE = '/api/v1';
const TIMEOUT_MS = 20_000;
const AUTH_TIMEOUT_MS = 5_000;

function isTimeout(error: unknown): boolean {
  return (
    isTimeoutError(error) ||
    (error instanceof Error && error.name === 'TimeoutError') ||
    (error instanceof DOMException && error.name === 'TimeoutError')
  );
}

function isAbort(error: unknown): boolean {
  return (
    (error instanceof DOMException && error.name === 'AbortError') ||
    (error instanceof Error && error.name === 'AbortError')
  );
}

async function resolveTokenWithTimeout(
  tokenPromise: Promise<string | null>,
  signal?: AbortSignal | null,
  timeoutMs = AUTH_TIMEOUT_MS,
): Promise<string | null> {
  if (signal?.aborted) {
    throw signal.reason ?? new DOMException('The user aborted a request.', 'AbortError');
  }

  let timer: ReturnType<typeof setTimeout> | undefined;
  let onAbort: (() => void) | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new DOMException('Auth token request timed out', 'TimeoutError'));
    }, timeoutMs);
  });

  const abortPromise = signal
    ? new Promise<never>((_, reject) => {
        onAbort = () =>
          reject(signal.reason ?? new DOMException('The user aborted a request.', 'AbortError'));
        signal.addEventListener('abort', onAbort, { once: true });
      })
    : null;

  try {
    const promises: Promise<string | null>[] = [tokenPromise, timeoutPromise];
    if (abortPromise) promises.push(abortPromise);
    return await Promise.race(promises);
  } finally {
    if (timer) clearTimeout(timer);
    if (signal && onAbort) signal.removeEventListener('abort', onAbort);
  }
}

/**
 * Ky is a transport only here: retries are off (TanStack Query owns read retries, and writes are
 * never replayed). Token attach, the single 401 refresh/retry and error normalization live in
 * `send`, which rebuilds each attempt from scratch so request bodies are never reused.
 */
const client = ky.create({ prefix: API_BASE, retry: 0, timeout: TIMEOUT_MS });

type RequestOptions = Pick<Options, 'searchParams' | 'json' | 'signal' | 'timeout'>;

/** Paths are relative to /api/v1; anything absolute could leak the token to another origin. */
function assertRelative(path: string) {
  if (/^([a-z][a-z0-9+.-]*:|\/)/i.test(path))
    throw new Error('API paths must be relative: ' + path);
}

async function attempt(
  method: string,
  path: string,
  options: RequestOptions,
  token: string | null,
  requestId: string,
  sentAt: number,
) {
  // The public config endpoint is fetched before any session exists and never carries a token.
  const headers: Record<string, string> = {
    'X-Request-Id': requestId,
    'X-Client-Sent-At': String(sentAt),
  };
  if (import.meta.env.DEV) headers['X-Timing-Detail'] = '1'; // server still requires an authenticated caller
  if (token && path !== 'config') headers['Authorization'] = 'Bearer ' + token;
  return client(path, { ...options, method, headers });
}

async function normalize(error: unknown, requestId: string): Promise<ApiError> {
  if (error instanceof ApiError) return error;
  if (isHTTPError(error)) {
    const body: unknown = error.data ?? (await error.response.json().catch(() => undefined));
    return toApiError(
      error.response.status,
      body,
      error.response.headers.get('x-request-id') ?? requestId,
    );
  }
  if (isTimeout(error)) return toApiError(408, undefined, requestId);
  if (isAbort(error)) throw error; // cancellations are not API errors
  return toApiError(0, undefined, requestId);
}

async function send(method: string, path: string, options: RequestOptions): Promise<Response> {
  assertRelative(path);
  const requestId = crypto.randomUUID();
  const authed = authSession.enabled && path !== 'config';
  // window.event is the DOM event being dispatched; it is undefined for requests started by effects or timers.
  const started = performance.now();
  const clicked = clickToSendMs(window.event?.timeStamp, started);
  const sentAt = Date.now();
  const done = (status: number, response?: Response) =>
    recordTiming(
      computeTiming({
        requestId,
        method,
        path,
        status,
        totalMs: performance.now() - started,
        clickToSendMs: clicked,
        serverTiming: response?.headers.get('server-timing') ?? null,
      }),
    );
  const authTimeout =
    typeof options.timeout === 'number'
      ? Math.min(options.timeout, AUTH_TIMEOUT_MS)
      : AUTH_TIMEOUT_MS;
  const resolveToken = (promise: Promise<string | null>) =>
    resolveTokenWithTimeout(promise, options.signal, authTimeout);

  try {
    const tokenUsed = authed ? resolveToken(authSession.accessToken()) : Promise.resolve(null);
    try {
      const token = await tokenUsed;
      const response = await attempt(method, path, options, token, requestId, sentAt);
      done(response.status, response);
      return response;
    } catch (error) {
      // Only 401 triggers a refresh (not 403/422/5xx). A 401 means the server did not run the
      // handler, so replaying even a POST once is safe.
      if (!authed || !isHTTPError(error) || error.response.status !== 401) throw error;
      // Another request may already have refreshed: reuse the current token instead of refreshing again.
      const used = authed ? await tokenUsed : null;
      const current = await resolveToken(authSession.accessToken());
      const token =
        current && current !== used ? current : await resolveToken(authSession.refreshToken());
      if (!token) throw error;
      try {
        const response = await attempt(method, path, options, token, requestId, sentAt);
        done(response.status, response);
        return response;
      } catch (retryError) {
        if (isHTTPError(retryError) && retryError.response.status === 401)
          void authSession.signOut('local');
        throw retryError;
      }
    }
  } catch (error) {
    const normalized = await normalize(error, requestId);
    done(normalized.status, isHTTPError(error) ? error.response : undefined);
    throw normalized;
  }
}

async function json<T>(method: string, path: string, options: RequestOptions = {}): Promise<T> {
  const response = await send(method, path, options);
  if (response.status === 204) return undefined as T;
  try {
    return (await response.json()) as T;
  } catch {
    // A 2xx with a malformed body is a server fault, not a parse crash in the caller.
    throw toApiError(502, undefined, response.headers.get('x-request-id') ?? undefined);
  }
}

/** Typed JSON helpers; every failure is an ApiError. Pass `signal` from the Query context. */
export const api = {
  get: <T>(path: string, options?: RequestOptions) => json<T>('GET', path, options),
  post: <T>(path: string, options?: RequestOptions) => json<T>('POST', path, options),
  put: <T>(path: string, options?: RequestOptions) => json<T>('PUT', path, options),
  patch: <T>(path: string, options?: RequestOptions) => json<T>('PATCH', path, options),
  delete: <T>(path: string, options?: RequestOptions) => json<T>('DELETE', path, options),
};

/** Prefix of a list's routes, e.g. `lists/abc/queue`. */
export const listPath = (listId: string) => 'lists/' + encodeURIComponent(listId);
