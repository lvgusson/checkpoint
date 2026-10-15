// RFC 9457 Problem Details plus the legacy `{ error: { message } }` object that
// clients written before the standard error format still read.
export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  detail: string;
  /** Stable machine-readable identifier of the error class. */
  code: string;
  requestId: string;
  /** Deprecated: kept so existing clients keep working. */
  error: { message: string };
}

/** Stable `code` values of ProblemDetails. */
export const ProblemCode = {
  BadRequest: 'bad_request',
  Unauthenticated: 'unauthenticated',
  Forbidden: 'forbidden',
  NotFound: 'not_found',
  MethodNotAllowed: 'method_not_allowed',
  Conflict: 'conflict',
  PayloadTooLarge: 'payload_too_large',
  RateLimited: 'rate_limited',
  BadGateway: 'bad_gateway',
  Unavailable: 'unavailable',
  InternalError: 'internal_error',
} as const;
export type ProblemCode = (typeof ProblemCode)[keyof typeof ProblemCode];
