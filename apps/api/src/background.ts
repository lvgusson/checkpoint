// Trabalho que continua depois da resposta HTTP.
// Na Vercel a função congela assim que a resposta termina; `waitUntil` mantém a instância
// viva até a promise acabar. Fora da Vercel não há contexto e a chamada é um no-op: a
// promise segue rodando normalmente no processo do Node.
import { logger } from './logger.ts';
import { waitUntil } from '@vercel/functions';

/** `task` não deve rejeitar (trate e registre os erros antes). */
export function runInBackground(task: Promise<unknown>): void {
  waitUntil(task.catch((e) => logger.error('background.failed', { error: e })));
}
