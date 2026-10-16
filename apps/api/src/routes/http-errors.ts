// Maps any thrown value to an RFC 9457 Problem Details response. Only AppError messages are
// client-safe; everything else becomes a generic 500 that carries just the request id.
import { STATUS_CODES } from 'node:http';
import { ProblemCode, type ProblemDetails } from '../../../../packages/core/src/problem.ts';
import { AppError } from '../shared/errors.ts';
import { errors } from '../observability/logger.ts';

const CODES: Record<number, ProblemCode> = {
  400: ProblemCode.BadRequest,
  401: ProblemCode.Unauthenticated,
  403: ProblemCode.Forbidden,
  404: ProblemCode.NotFound,
  405: ProblemCode.MethodNotAllowed,
  409: ProblemCode.Conflict,
  413: ProblemCode.PayloadTooLarge,
  429: ProblemCode.RateLimited,
  502: ProblemCode.BadGateway,
  503: ProblemCode.Unavailable,
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
  } else if (e instanceof URIError || (e as { code?: string }).code === 'FST_ERR_BAD_URL') {
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
      code: CODES[status] ?? (status >= 500 ? ProblemCode.InternalError : ProblemCode.BadRequest),
      requestId,
      error: { message: detail },
    },
  };
}
