// Autenticação da API com JWT do Supabase Auth.
//
// Caminho principal: verificação LOCAL da assinatura com as chaves públicas do projeto
// (JWKS em <SUPABASE_URL>/auth/v1/.well-known/jwks.json, chaves assimétricas ES256/RS256).
// `jose` baixa o JWKS uma vez, guarda em cache e só busca de novo quando aparece um `kid`
// desconhecido (rotação de chaves) — nenhuma chamada de rede por requisição.
//
// Fallback: projetos que ainda assinam com o segredo HS256 legado não publicam a chave no
// JWKS. Para esses tokens (alg HS256) a API pergunta ao próprio Supabase Auth
// (GET /auth/v1/user — o mesmo que `supabase.auth.getUser(token)` faz), ao custo de uma
// chamada de rede por requisição. Migre para "JWT Signing Keys" no painel para evitar isso.
import {
  createRemoteJWKSet,
  decodeJwt,
  decodeProtectedHeader,
  errors,
  jwtVerify,
  type JWTPayload,
  type JWTVerifyGetKey,
} from 'jose';
import { createHash } from 'node:crypto';
import { roleFromAppMetadata, type Role } from '../../../../packages/core/src/authorization.ts';
import { AppError } from '../shared/errors.ts';
import { logger } from '../observability/logger.ts';
import { createRateLimiter } from './rate-limit.ts';

export interface AuthUser {
  id: string;
  email?: string;
  /** Product role (app_metadata.role); not the Supabase database role. */
  role: Role;
  accessToken: string;
  claims: JWTPayload;
}

export interface Authenticator {
  /** Recebe o header Authorization; devolve o usuário ou lança AppError 401. */
  authenticate(authorization: string | undefined, clientKey?: string): Promise<AuthUser>;
}

export interface AuthenticatorOptions {
  /** Chave(s) de verificação — em produção, createRemoteJWKSet(...). */
  key: JWTVerifyGetKey;
  /** `iss` esperado: <SUPABASE_URL>/auth/v1 */
  issuer?: string;
  /** `aud` esperado; o Supabase usa "authenticated" para usuários logados. */
  audience?: string;
  /** Validação remota para tokens HS256 (segredo legado). */
  fallback?: (token: string, clientKey?: string) => Promise<AuthUser>;
}

export const unauthorized = (message = 'Autenticação necessária') => new AppError(message, 401);

export function createAuthenticator(options: AuthenticatorOptions): Authenticator {
  return {
    async authenticate(authorization, clientKey) {
      const match = /^Bearer\s+(\S+)$/i.exec(authorization ?? '');
      if (!match) throw unauthorized();
      const token = match[1];
      let alg: string | undefined;
      try {
        alg = decodeProtectedHeader(token).alg;
      } catch {
        throw unauthorized('Token inválido');
      }
      if (alg === 'HS256') {
        if (!options.fallback) throw unauthorized('Token inválido');
        return options.fallback(token, clientKey);
      }
      try {
        const { payload } = await jwtVerify(token, options.key, {
          issuer: options.issuer,
          audience: options.audience ?? 'authenticated',
          algorithms: ['ES256', 'RS256', 'EdDSA'],
        });
        if (!payload.sub) throw unauthorized('Token inválido');
        return {
          id: payload.sub,
          email: typeof payload.email === 'string' ? payload.email : undefined,
          role: roleFromAppMetadata(payload.app_metadata),
          accessToken: token,
          claims: payload,
        };
      } catch (e) {
        if (e instanceof AppError) throw e;
        if (e instanceof errors.JWTExpired) throw unauthorized('Sessão expirada');
        // Falha ao buscar o JWKS não é culpa do cliente: 503 em vez de 401 (evita logout em massa).
        if (
          e instanceof errors.JWKSTimeout ||
          (e instanceof TypeError && !(e instanceof errors.JOSEError))
        )
          throw new AppError('Serviço de autenticação indisponível', 503);
        throw unauthorized('Token inválido');
      }
    },
  };
}

interface SupabaseUser {
  id: string;
  email?: string;
  email_confirmed_at?: string | null;
  app_metadata?: unknown;
}

/** GET /auth/v1/user (what supabase.auth.getUser does). 401 for rejected tokens, 503 when Supabase is unhealthy. */
async function fetchSupabaseUser(supabaseUrl: string, apiKey: string, token: string) {
  let res: Response;
  try {
    res = await fetch(new URL('/auth/v1/user', supabaseUrl), {
      headers: { apikey: apiKey, Authorization: 'Bearer ' + token },
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    throw new AppError('Serviço de autenticação indisponível', 503);
  }
  if (res.status === 429 || res.status >= 500) {
    logger.warn('auth.supabase_unavailable', { status: res.status });
    throw new AppError('Serviço de autenticação indisponível', 503);
  }
  if (!res.ok) throw unauthorized('Token inválido');
  return (await res.json()) as SupabaseUser;
}

/**
 * Fallback HS256: validates the token with Supabase Auth. Successful validations are cached by
 * token hash (30 s, never past the token's exp) so normal traffic costs no round trips; rejected
 * tokens are remembered for 60 s; only cache misses count against a per-client rate limit.
 */
export function remoteUserFallback(supabaseUrl: string, apiKey: string) {
  const rejected = new Map<string, number>();
  const accepted = new Map<string, { user: AuthUser; until: number }>();
  const allow = createRateLimiter(300, 60_000);
  return async (token: string, clientKey = 'unknown'): Promise<AuthUser> => {
    const key = createHash('sha256').update(token).digest('hex');
    const now = Date.now();
    const hit = accepted.get(key);
    if (hit && hit.until > now) return hit.user;
    if ((rejected.get(key) ?? 0) > now) throw unauthorized('Token inválido');
    if (!allow(clientKey)) throw new AppError('Muitas tentativas de autenticação', 429);
    let user: SupabaseUser;
    try {
      user = await fetchSupabaseUser(supabaseUrl, apiKey, token);
    } catch (e) {
      if (e instanceof AppError && e.code === 401) {
        if (rejected.size >= 1000) rejected.clear();
        rejected.set(key, now + 60_000);
      }
      throw e;
    }
    const result: AuthUser = {
      id: user.id,
      email: user.email,
      role: roleFromAppMetadata(user.app_metadata),
      accessToken: token,
      claims: { sub: user.id },
    };
    const exp = decodeJwt(token).exp;
    const until = Math.min(now + 30_000, exp ? exp * 1000 : 0);
    if (until > now) {
      if (accepted.size >= 1000) accepted.clear();
      accepted.set(key, { user: result, until });
    }
    return result;
  };
}

/**
 * Whether Supabase reports the user's e-mail as confirmed. JWT `user_metadata` is editable by the
 * user, so the server-controlled `email_confirmed_at` is read from Supabase instead.
 */
export function remoteEmailVerifier(env: Env = process.env) {
  const { url, publishableKey } = supabaseKeys(env);
  if (!url || !publishableKey) return undefined;
  return async (token: string) =>
    Boolean((await fetchSupabaseUser(url, publishableKey, token)).email_confirmed_at);
}

const LOOPBACK = /^(localhost|::1|\[::1\]|127(\.\d{1,3}){3})$/;

/** Authentication may be disabled only for local development on a loopback address. */
export function assertNoAuthAllowed(env: Env, host: string): void {
  if (env.NODE_ENV === 'production' || env.VERCEL || !LOOPBACK.test(host))
    throw new Error(
      'Refusing to start without authentication: set SUPABASE_URL, or run with NODE_ENV != production, VERCEL unset and HOST bound to loopback.',
    );
}

type Env = Record<string, string | undefined>;

const supabaseKeys = (env: Env) => ({
  url: env.SUPABASE_URL?.replace(/\/+$/, ''),
  publishableKey: env.SUPABASE_PUBLISHABLE_KEY ?? env.SUPABASE_ANON_KEY,
});

/**
 * Autenticador a partir das variáveis de ambiente.
 * - SUPABASE_URL definido → JWT obrigatório nas rotas /api/* protegidas.
 * - Sem SUPABASE_URL em produção (NODE_ENV=production ou Vercel) → falha fechada (503).
 * - Sem SUPABASE_URL em desenvolvimento/testes → null (auth desligada, com aviso).
 */
export function authenticatorFromEnv(env: Env = process.env): Authenticator | null {
  const { url, publishableKey } = supabaseKeys(env);
  if (!url) {
    if (env.NODE_ENV === 'production' || env.VERCEL)
      return {
        authenticate: () => Promise.reject(new AppError('Autenticação não configurada', 503)),
      };
    return null;
  }
  return createAuthenticator({
    key: createRemoteJWKSet(new URL(url + '/auth/v1/.well-known/jwks.json'), {
      cacheMaxAge: 10 * 60 * 1000,
    }),
    issuer: url + '/auth/v1',
    fallback: publishableKey ? remoteUserFallback(url, publishableKey) : undefined,
  });
}

/** Configuração PÚBLICA para o front (URL + publishable key são públicas por design). */
export function publicAuthConfig(env: Env = process.env) {
  const { url, publishableKey } = supabaseKeys(env);
  return {
    auth:
      url && publishableKey
        ? {
            supabaseUrl: url,
            supabasePublishableKey: publishableKey,
            providers: { github: env.AUTH_GITHUB_ENABLED === 'true' },
          }
        : null,
  };
}
