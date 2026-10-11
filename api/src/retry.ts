// Retry com espera exponencial: 5 tentativas, 200 ms iniciais, fator 2 (200, 400, 800, 1600).
export interface RetryOptions {
  attempts?: number;
  initialDelayMs?: number;
  factor?: number;
  shouldRetry?: (error: unknown) => boolean;
  sleep?: (ms: number) => Promise<void>;
}

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export async function retry<T>(
  fn: (attempt: number) => Promise<T>,
  {
    attempts = 5,
    initialDelayMs = 200,
    factor = 2,
    shouldRetry = () => true,
    sleep = wait,
  }: RetryOptions = {},
): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn(attempt);
    } catch (e) {
      if (attempt >= attempts || !shouldRetry(e)) throw e;
      await sleep(initialDelayMs * factor ** (attempt - 1));
    }
  }
}
