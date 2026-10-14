// Retentativa com espera exponencial: com os padrões são 5 tentativas e esperas
// de 200, 400, 800 e 1600 ms entre elas (initialDelayMs × factor^(n-1)).

export interface RetryOptions {
  /** Total de tentativas, incluindo a primeira (padrão 5). */
  attempts?: number;
  /** Espera antes da 2ª tentativa, em ms (padrão 200). */
  initialDelayMs?: number;
  /** Multiplicador da espera a cada nova tentativa (padrão 2). */
  factor?: number;
  /** Teto opcional de cada espera, em ms. */
  maxDelayMs?: number;
  /** false = desiste na hora (ex.: erro de validação não melhora tentando de novo). */
  shouldRetry?: (error: unknown, attempt: number) => boolean;
  /** Chamado antes de cada espera (log/métrica). */
  onRetry?: (error: unknown, attempt: number, delayMs: number) => void;
  /** Substituível nos testes para não esperar tempo real. */
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
  signal?: AbortSignal;
}

export const retryDefaults = { attempts: 5, initialDelayMs: 200, factor: 2 } as const;

const abortError = (signal: AbortSignal) =>
  signal.reason instanceof Error ? signal.reason : new Error('Retentativa cancelada');

export const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(abortError(signal));
    const onAbort = () => {
      clearTimeout(timer);
      reject(abortError(signal!));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });

/** Espera antes da tentativa `attempt + 1` (attempt começa em 1). */
export const retryDelay = (
  attempt: number,
  {
    initialDelayMs = retryDefaults.initialDelayMs,
    factor = retryDefaults.factor,
    maxDelayMs = Infinity,
  }: RetryOptions = {},
) => Math.min(maxDelayMs, initialDelayMs * factor ** (attempt - 1));

/** Executa `fn` até dar certo ou acabarem as tentativas; lança o último erro. */
export async function retry<T>(
  fn: (attempt: number) => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const attempts = options.attempts ?? retryDefaults.attempts;
  if (!Number.isInteger(attempts) || attempts < 1)
    throw new RangeError('attempts deve ser um inteiro >= 1');
  const wait = options.sleep ?? sleep;
  for (let attempt = 1; ; attempt++) {
    if (options.signal?.aborted) throw abortError(options.signal);
    try {
      return await fn(attempt);
    } catch (error) {
      if (attempt >= attempts || options.shouldRetry?.(error, attempt) === false) throw error;
      const delay = retryDelay(attempt, options);
      options.onRetry?.(error, attempt, delay);
      await wait(delay, options.signal);
    }
  }
}
