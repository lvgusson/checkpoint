/** The only error type UI code needs to understand. */
export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly requestId?: string;

  constructor(init: { status: number; message: string; code?: string; requestId?: string }) {
    super(init.message);
    this.name = 'ApiError';
    this.status = init.status;
    this.code = init.code;
    this.requestId = init.requestId;
  }

  /** Transport-level failures and server-side faults a read may safely retry. */
  get retryable(): boolean {
    return [0, 408, 429].includes(this.status) || this.status >= 500;
  }
}

export const isApiError = (error: unknown): error is ApiError => error instanceof ApiError;

type Body = Record<string, unknown> | undefined;
const text = (value: unknown) => (typeof value === 'string' && value ? value : undefined);

/**
 * Parses an error body. Supports RFC 9457 Problem Details
 * (`{type,title,status,detail,code?}`) and the legacy `{error:{message,code?}}` shape.
 */
function parseErrorBody(body: unknown): { message?: string; code?: string } {
  if (!body || typeof body !== 'object') return {};
  const root = body as Body;
  const legacy = root?.['error'];
  if (legacy && typeof legacy === 'object') {
    const e = legacy as Body;
    return { message: text(e?.['message']), code: text(e?.['code']) };
  }
  if (typeof legacy === 'string') return { message: legacy };
  const type = text(root?.['type']);
  return {
    message: text(root?.['detail']) ?? text(root?.['title']),
    code: text(root?.['code']) ?? (type && type !== 'about:blank' ? type : undefined),
  };
}

const FALLBACK: Record<number, string> = {
  0: 'Sem conexão com o servidor.',
  408: 'A requisição demorou demais. Tente de novo.',
  401: 'Sua sessão expirou. Entre novamente.',
  403: 'Você não tem permissão para fazer isto.',
  404: 'Não encontrado.',
};

export function toApiError(status: number, body: unknown, requestId?: string): ApiError {
  const parsed = parseErrorBody(body);
  return new ApiError({
    status,
    code: parsed.code,
    requestId,
    message:
      parsed.message ??
      FALLBACK[status] ??
      (status >= 500 ? 'Erro no servidor. Tente de novo.' : `Falha na requisição (${status}).`),
  });
}
