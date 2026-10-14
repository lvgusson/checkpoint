// Contexto por requisição (AsyncLocalStorage): qualquer função chamada durante a
// requisição — serviço, repositório — lê o usuário com getContext(), sem precisar
// receber userId/token como parâmetro em toda a cadeia.
import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';

export interface RequestContext {
  requestId: string;
  /** `sub` do JWT do Supabase (auth.users.id). Ausente em rotas públicas. */
  userId?: string;
  /** JWT do usuário, para chamadas ao Supabase "como o usuário" (RLS). */
  accessToken?: string;
  /** E-mail do token (usado só para vincular o app_user do seed no primeiro login). */
  email?: string;
  /** app_user.id resolvido (cache por requisição; scripts/testes podem defini-lo direto). */
  appUserId?: string;
}

const storage = new AsyncLocalStorage<RequestContext>();

export function runWithContext<T>(ctx: Partial<RequestContext>, fn: () => T): T {
  return storage.run({ requestId: randomUUID(), ...ctx }, fn);
}

/** Contexto da requisição atual, ou undefined fora de uma requisição. */
export function getContext(): RequestContext | undefined {
  return storage.getStore();
}

/** Completa o contexto atual (ex.: após autenticar). Ignorado fora de uma requisição. */
export function setContext(patch: Partial<RequestContext>): void {
  const ctx = storage.getStore();
  if (ctx) Object.assign(ctx, patch);
}

/** userId da requisição atual; lança se não houver usuário autenticado. */
export function requireUserId(): string {
  const userId = storage.getStore()?.userId;
  if (!userId) throw new Error('Nenhum usuário autenticado no contexto da requisição');
  return userId;
}
