import { timingSafeEqual } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import { AppError } from '../shared/errors.ts';
import { ApiPath, HttpMethod } from './http.ts';
import type { ReleaseStore } from '../data/ports.ts';
import { ENVIRONMENTS, parseReleaseInput, type Environment } from '../domain/releases.ts';
import { createRelease } from '../services/releases.ts';

/** Compare equal-length tokens in constant time; missing configuration disables POST. */
export function checkReleaseToken(req: IncomingMessage, expected: string | undefined) {
  if (!expected)
    throw new AppError('Registro de versões desativado (RELEASE_API_TOKEN ausente)', 503);
  const header =
    req.headers['x-release-token'] ?? req.headers.authorization?.replace(/^Bearer\s+/i, '');
  const given = Buffer.from(typeof header === 'string' ? header : '');
  const want = Buffer.from(expected);
  if (given.length !== want.length || !timingSafeEqual(given, want))
    throw new AppError('Token de release inválido', 401);
}

/** Public GET and dedicated-token POST; unsupported methods return 405 with Allow. */
export async function releaseRoute(
  store: ReleaseStore | null,
  req: IncomingMessage,
  url: URL,
  readJson: () => Promise<Record<string, unknown>>,
  token: string | undefined = process.env.RELEASE_API_TOKEN,
): Promise<{ status: number; data: unknown } | null> {
  const path = url.pathname;
  if (path !== ApiPath.Releases && path !== ApiPath.ReleasesLatest) return null;
  const method = req.method ?? HttpMethod.Get;
  const allow =
    path === ApiPath.Releases ? `${HttpMethod.Get}, ${HttpMethod.Post}` : HttpMethod.Get;
  if (method !== HttpMethod.Get && !(method === HttpMethod.Post && path === ApiPath.Releases))
    throw new AppError('Método não permitido: versões são só leitura e inserção', 405, {
      Allow: allow,
    });
  if (!store) throw new AppError('Registro de versões indisponível (sem banco)', 503);
  const environment = (url.searchParams.get('environment') ?? 'production') as Environment;
  if (!ENVIRONMENTS.includes(environment)) throw new AppError('environment inválido');
  if (path === ApiPath.ReleasesLatest) {
    const latest = await store.latest(environment);
    if (!latest) throw new AppError('Nenhuma versão registrada', 404);
    return { status: 200, data: latest };
  }
  if (method === HttpMethod.Get) {
    const limit = Math.max(1, Math.min(100, Number(url.searchParams.get('limit')) || 20));
    const before = Number(url.searchParams.get('before')) || null;
    const items = await store.list(environment, limit, before);
    return {
      status: 200,
      data: { items, nextBefore: items.length === limit ? items.at(-1)!.id : null },
    };
  }
  checkReleaseToken(req, token);
  const input = parseReleaseInput(await readJson());
  const { release, created } = await createRelease(store, { ...input, createdBy: 'api' });
  return { status: created ? 201 : 200, data: { ...release, created } };
}
