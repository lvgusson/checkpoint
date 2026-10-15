// Resolve o app_user (dono dos dados) a partir do usuário autenticado no contexto.
//
// A API conecta direto no banco (RLS não se aplica), então todo repositório filtra por este
// id. Ordem de resolução:
//   1. contexto já resolvido (`appUserId`) — também é o atalho de scripts/testes;
//   2. app_user com auth_user_id = sub do JWT;
//   3. primeiro login do dono: vincula o app_user do seed (sem auth_user_id) se o e-mail,
//      confirmado no Supabase (email_confirmed_at), for igual ao e-mail do seed ou a SEED_OWNER_EMAIL;
//   4. senão cria um app_user vazio (equivalente a ensure_app_user(), que depende de
//      auth.uid() e por isso não serve para uma conexão direta).
// O mapeamento auth → app_user fica em cache na instância (não muda depois de criado).
import type { AppUserResolver } from '../data/ports.ts';
import { getContext, setContext } from '../shared/context.ts';
import { AppError } from '../shared/errors.ts';
import type { AppUserDriver } from '../data/drivers/types.ts';

export const SEED_APP_USER_ID = '00000000-0000-4000-8000-000000000001';

interface AppUserOptions {
  /** Usado quando não há usuário autenticado (somente dev com auth desligada). */
  devAppUserId?: string;
  seedOwnerEmail?: string;
  /** Confirms the e-mail with the identity provider; without it the seed account is never claimed. */
  isEmailVerified?: (accessToken: string) => Promise<boolean>;
}

export function createAppUserResolver(
  driver: AppUserDriver,
  options: AppUserOptions = {},
): AppUserResolver {
  const cache = new Map<string, Promise<string>>();
  const seedOwnerEmail = options.seedOwnerEmail?.trim() ?? '';

  async function lookup(authId: string, email: string | null, token?: string): Promise<string> {
    const found = await driver.findByAuthId(authId);
    if (found) return found;
    if (email && token && (await options.isEmailVerified?.(token))) {
      const claimed = await driver.claimSeed(SEED_APP_USER_ID, authId, email, seedOwnerEmail);
      if (claimed) return claimed;
    }
    const created = await driver.create(authId, email);
    if (!created) throw new AppError('Usuário sem acesso', 403);
    return created;
  }

  return async () => {
    const ctx = getContext();
    if (ctx?.appUserId) return ctx.appUserId;
    const authId = ctx?.userId;
    if (!authId) {
      if (options.devAppUserId) return options.devAppUserId;
      throw new AppError('Autenticação necessária', 401);
    }
    let pending = cache.get(authId);
    if (!pending) {
      pending = lookup(authId, ctx.email?.trim() || null, ctx.accessToken);
      cache.set(authId, pending);
      pending.catch(() => cache.delete(authId));
    }
    const id = await pending;
    setContext({ appUserId: id });
    return id;
  };
}
