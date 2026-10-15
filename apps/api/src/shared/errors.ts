/** Expected failure with the HTTP status to answer; its message is safe to show the client. */
export class AppError extends Error {
  code: number;
  /** Extra response headers (for example Allow or Retry-After). */
  headers?: Record<string, string>;
  constructor(message: string, code = 400, headers?: Record<string, string>) {
    super(message);
    this.code = code;
    this.headers = headers;
  }
}
