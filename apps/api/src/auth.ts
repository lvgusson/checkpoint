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
  decodeProtectedHeader,
  errors,
  jwtVerify,
  type JWTPayload,
  type JWTVerifyGetKey,
} from 'jose';
import { AppError } from './service.ts';

export interface AuthUser {
  id: string;
  email?: string;
  role?: string;
  accessToken: string;
  claims: JWTPayload;
}

export interface Authenticator {
  /** Recebe o header Authorization; devolve o usuário ou lança AppError 401. */
  authenticate(authorization: string | undefined): Promise<AuthUser>;
}

export interface AuthenticatorOptions {
  /** Chave(s) de verificação — em produção, createRemoteJWKSet(...). */
  key: JWTVerifyGetKey;
  /** `iss` esperado: <SUPABASE_URL>/auth/v1 */
  issuer?: string;
  /** `aud` esperado; o Supabase usa "authenticated" para usuários logados. */
  audience?: string;
  /** Validação remota para tokens HS256 (segredo legado). */
  fallback?: (token: string) => Promise<AuthUser>;
}

export const unauthorized = (message = 'Autenticação necessária') => new AppError(message, 401);

export function createAuthenticator(options: AuthenticatorOptions): Authenticator {
  return {
    async authenticate(authorization) {
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
        return options.fallback(token);
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
          role: typeof payload.role === 'string' ? payload.role : undefined,
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

/** Fallback HS256: valida o token no Supabase Auth (equivalente a supabase.auth.getUser). */
export function remoteUserFallback(supabaseUrl: string, apiKey: string) {
  return async (token: string): Promise<AuthUser> => {
    let res: Response;
    try {
      res = await fetch(new URL('/auth/v1/user', supabaseUrl), {
        headers: { apikey: apiKey, Authorization: 'Bearer ' + token },
      });
    } catch {
      throw new AppError('Serviço de autenticação indisponível', 503);
    }
    if (!res.ok) throw unauthorized('Token inválido');
    const user = (await res.json()) as { id: string; email?: string; role?: string };
    return {
      id: user.id,
      email: user.email,
      role: user.role,
      accessToken: token,
      claims: { sub: user.id },
    };
  };
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
