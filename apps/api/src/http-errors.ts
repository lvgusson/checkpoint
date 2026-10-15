// Maps any thrown value to an RFC 9457 Problem Details response. Only AppError messages are
// client-safe; everything else becomes a generic 500 that carries just the request id.
import { STATUS_CODES } from 'node:http';
import type { ProblemDetails } from '../../../packages/core/src/problem.ts';
import { AppError } from './service.ts';
import { errors } from './logger.ts';

const CODES: Record<number, string> = {
  400: 'bad_request',
  401: 'unauthenticated',
  403: 'forbidden',
  404: 'not_found',
  405: 'method_not_allowed',
  409: 'conflict',
  413: 'payload_too_large',
  429: 'rate_limited',
  502: 'bad_gateway',
  503: 'unavailable',
};

export function toProblem(
  e: unknown,
  requestId: string,
): { status: number; headers: Record<string, string>; body: ProblemDetails } {
  let status = 500;
  let detail = 'Erro interno';
  let headers: Record<string, string> = {};
  if (e instanceof AppError) {
    ({ code: status, message: detail } = e);
    headers = e.headers ?? {};
  } else if (e instanceof URIError) {
    status = 400;
    detail = 'Codificação de URL inválida';
  } else {
    errors.report(e, { requestId, event: 'http.unhandled_error' });
  }
  return {
    status,
    headers,
    body: {
      type: 'about:blank',
      title: STATUS_CODES[status] ?? 'Error',
      status,
      detail,
      code: CODES[status] ?? (status >= 500 ? 'internal_error' : 'bad_request'),
      requestId,
      error: { message: detail },
    },
  };
}
