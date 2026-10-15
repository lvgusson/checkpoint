import ky, { isHTTPError, isTimeoutError, type Options } from 'ky';
import { authSession } from '../auth/session';
import { ApiError, toApiError } from './errors';

export { ApiError, isApiError } from './errors';

const API_BASE = '/api/v1';
const TIMEOUT_MS = 20_000;

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
) {
  // The public config endpoint is fetched before any session exists and never carries a token.
  const headers: Record<string, string> = { 'X-Request-Id': requestId };
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
  if (isTimeoutError(error)) return toApiError(408, undefined, requestId);
  if (error instanceof DOMException && error.name === 'AbortError') throw error; // cancellations are not API errors
  return toApiError(0, undefined, requestId);
}

async function send(method: string, path: string, options: RequestOptions): Promise<Response> {
  assertRelative(path);
  const requestId = crypto.randomUUID();
  const authed = authSession.enabled && path !== 'config';
  try {
    const tokenUsed = authed ? authSession.accessToken() : Promise.resolve(null);
    try {
      return await attempt(method, path, options, await tokenUsed, requestId);
    } catch (error) {
      // Only 401 triggers a refresh (not 403/422/5xx). A 401 means the server did not run the
      // handler, so replaying even a POST once is safe.
      if (!authed || !isHTTPError(error) || error.response.status !== 401) throw error;
      // Another request may already have refreshed: reuse the current token instead of refreshing again.
      const used = authed ? await tokenUsed : null;
      const current = await authSession.accessToken();
      const token = current && current !== used ? current : await authSession.refreshToken();
      if (!token) throw error;
      try {
        return await attempt(method, path, options, token, requestId);
      } catch (retryError) {
        if (isHTTPError(retryError) && retryError.response.status === 401)
          void authSession.signOut('local');
        throw retryError;
      }
    }
  } catch (error) {
    throw await normalize(error, requestId);
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
