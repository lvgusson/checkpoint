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
