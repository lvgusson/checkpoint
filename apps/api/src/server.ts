import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GameService, AppError, desires } from './service.ts';
import { createService } from './setup.ts';
import { SEED_APP_USER_ID } from './app-user.ts';
import {
  assertNoAuthAllowed,
  authenticatorFromEnv,
  publicAuthConfig,
  type Authenticator,
} from './auth.ts';
import { can, type Permission } from '../../../packages/core/src/authorization.ts';
import { toProblem } from './http-errors.ts';
import { flushLogs, logger, metrics } from './logger.ts';
import { telemetryRoute } from './telemetry-routes.ts';
import { getContext, runWithContext, setContext } from './context.ts';
import { currentVersion } from './version.ts';
import { runInBackground } from './background.ts';
import type { WishlistService } from './wishlist.ts';
import { wishlistRoute } from './wishlist-routes.ts';
import { releaseRoute, releaseStoreFromEnv, type ReleaseStore } from './releases.ts';
const root = fileURLToPath(new URL('../', import.meta.url));
const MAX_BODY_BYTES = 100_000;
const REQUEST_ID = /^[\w.-]{8,64}$/;
const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
};
const need = (permission: Permission) => {
  if (!can(getContext()?.role, permission)) throw new AppError('Acesso negado', 403);
};
// auth: null desliga a autenticação (dev/testes sem SUPABASE_URL). Ver api/src/auth.ts.
export function makeServer(
  service: GameService,
  auth: Authenticator | null = authenticatorFromEnv(),
  wishlist: WishlistService | null = null,
  releases: ReleaseStore | null = releaseStoreFromEnv(),
) {
  return createServer((req, res) => {
    const incoming = req.headers['x-request-id'];
    const requestId =
      typeof incoming === 'string' && REQUEST_ID.test(incoming) ? incoming : randomUUID();
    const startedAt = performance.now();
    res.setHeader('X-Request-Id', requestId);
    for (const [k, v] of Object.entries(SECURITY_HEADERS)) res.setHeader(k, v);
    if (req.url?.startsWith('/api/'))
      res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
    let logged = false;
    const onDone = () => {
      if (logged) return;
      logged = true;
      const ms = Math.round(performance.now() - startedAt);
      const route = (req.url ?? '').split('?')[0];
      logger.info('http.request', {
        method: req.method,
        path: route,
        status: res.statusCode,
        ms,
        aborted: !res.writableFinished,
        requestId,
      });
      metrics.timing('http.server.duration', ms, { method: req.method, status: res.statusCode });
    };
    res.on('finish', onDone);
    res.on('close', onDone); // aborted requests never emit finish
    return runWithContext({ requestId }, async () => {
      const send = (data: unknown, status = 200) => {
        res.writeHead(status, {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'no-store',
        });
        res.end(JSON.stringify(data));
      };
      const readJson = async (maxBytes = MAX_BODY_BYTES): Promise<Record<string, unknown>> => {
        if (Number(req.headers['content-length'] ?? 0) > maxBytes)
          throw new AppError('Conteúdo muito grande', 413);
        const chunks: Buffer[] = [];
        let size = 0;
        for await (const chunk of req) {
          size += chunk.length;
          if (size > maxBytes) throw new AppError('Conteúdo muito grande', 413);
          chunks.push(chunk);
        }
        let body;
        try {
          body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        } catch {
          throw new AppError('JSON inválido');
        }
        if (!body || Array.isArray(body) || typeof body !== 'object')
          throw new AppError('Objeto JSON obrigatório');
        return body;
      };
      try {
        const url = new URL(req.url ?? '/', 'http://localhost');
        const path = url.pathname;
        if (path === '/api/v1/health') return send({ status: 'ok' });
        if (path === '/api/v1/openapi.json') {
          res.setHeader('Content-Type', 'application/json');
          res.end(await readFile(resolve(root, 'openapi.json')));
          return;
        }
        if (path === '/api/v1/config') return send(publicAuthConfig());
        if (path === '/api/v1/version') return send(await currentVersion());
        // Public release reads and dedicated-token registration precede user authentication.
        if (path.startsWith('/api/v1/releases')) {
          const hit = await releaseRoute(releases, req, url, readJson);
          if (hit) {
            return send(hit.data, hit.status);
          }
        }
        // Daqui em diante, toda rota /api/* exige JWT do Supabase (401 se ausente/inválido).
        if (auth && path.startsWith('/api/')) {
          const user = await auth.authenticate(
            req.headers.authorization,
            String(req.headers['x-forwarded-for'] ?? '')
              .split(',')[0]
              .trim() || req.socket.remoteAddress,
          );
          setContext({
            userId: user.id,
            accessToken: user.accessToken,
            email: user.email,
            role: user.role,
          });
        } else if (path.startsWith('/api/')) setContext({ role: 'admin' }); // no-auth dev mode
        if (path === '/api/v1/telemetry' && req.method === 'POST')
          return send(await telemetryRoute(readJson), 202);
        if (path.startsWith('/api/')) {
          const read = req.method === 'GET' || req.method === 'HEAD';
          need(
            !read && path.includes('/settings/')
              ? 'settings:update'
              : read
                ? 'games:read'
                : 'games:update',
          );
        }
        if (path === '/api/v1/catalog' && req.method === 'GET')
          return send(await service.catalog());
        if (path === '/api/v1/games/search' && req.method === 'GET')
          return send(
            await service.searchGames(
              url.searchParams.get('q') ?? '',
              url.searchParams.get('excludeId') ?? undefined,
            ),
          );
        if (path === '/api/v1/games' && req.method === 'GET') {
          let games = await service.all();
          const normalize = (s: string) =>
            s
              .normalize('NFD')
              .replace(/[\u0300-\u036f]/g, '')
              .toLowerCase();
          const q = normalize(url.searchParams.get('q') ?? '');
          games = games.filter((g) =>
            normalize(g.name + ' ' + g.secondaryTags.join(' ')).includes(q),
          );
          for (const field of ['status', 'primaryGenre', 'store'] as const) {
            const v = url.searchParams.get(field);
            if (v) games = games.filter((g) => g[field] === v);
          }
          const sort = url.searchParams.get('sort');
          games.sort(
            sort === 'score'
              ? (a, b) => b.baseScore - a.baseScore
              : sort === 'desire'
                ? (a, b) => desires.indexOf(a.desire) - desires.indexOf(b.desire)
                : (a, b) => a.name.localeCompare(b.name, 'pt-BR'),
          );
          const page = Math.max(1, Number(url.searchParams.get('page')) || 1),
            pageSize = Math.max(1, Math.min(100, Number(url.searchParams.get('pageSize')) || 24));
          return send({
            items: games.slice((page - 1) * pageSize, page * pageSize),
            total: games.length,
            page,
            pageSize,
          });
        }
        const match = path.match(/^\/api\/v1\/games\/([^/]+)$/);
        if (match) {
          const id = decodeURIComponent(match[1]);
          if (req.method === 'GET') {
            const game = (await service.all()).find((g) => g.id === id);
            if (!game) throw new AppError('Jogo não encontrado', 404);
            return send(game);
          }
          if (req.method === 'PATCH') return send(await service.patch(id, await readJson()));
        }
        if (path === '/api/v1/lists') {
          if (req.method === 'GET') return send(await service.allLists());
          if (req.method === 'POST') return send(await service.createList(await readJson()), 201);
        }
        const listMatch = path.match(/^\/api\/v1\/lists\/([^/]+)$/);
        if (listMatch) {
          const listId = decodeURIComponent(listMatch[1]);
          if (req.method === 'PATCH')
            return send(await service.renameList(listId, await readJson()));
          if (req.method === 'DELETE') {
            await service.deleteList(listId);
            res.writeHead(204, { 'Cache-Control': 'no-store' });
            return res.end();
          }
        }
        // Rotas da fila/configuração: /api/v1/lists/{listId}/... ou, sem o prefixo, a lista padrão.
        const scoped = path.match(
          /^\/api\/v1(?:\/lists\/([^/]+))?(\/recommendations|\/queue\/reorder|\/queue\/adjustments(?:\/[^/]+)?|\/settings\/scoring(?:\/reset)?)$/,
        );
        if (scoped) {
          const listId = scoped[1] === undefined ? undefined : decodeURIComponent(scoped[1]);
          const route = scoped[2];
          const method = req.method;
          if (route === '/recommendations' && method === 'GET')
            return send(await service.recommendations(listId));
          if (route === '/queue/reorder' && method === 'POST') {
            const body = await readJson();
            // 200 assim que validar; o recálculo e a gravação continuam depois da resposta.
            const { accepted, done } = await service.reorder(body.gameId, body.toPosition, listId);
            runInBackground(done);
            return send({ ...accepted, status: 'accepted' });
          }
          if (route === '/queue/adjustments' && method === 'GET')
            return send(await service.manualState(listId));
          if (route.startsWith('/queue/adjustments/') && method === 'DELETE') {
            const gameId = decodeURIComponent(route.slice('/queue/adjustments/'.length));
            return send(await service.resetManual(gameId, listId));
          }
          if (route === '/settings/scoring' && method === 'GET')
            return send(await service.scoringSettings(listId));
          if (route === '/settings/scoring' && method === 'PUT')
            return send(await service.saveScoringSettings(await readJson(), listId));
          if (route === '/settings/scoring/reset' && method === 'POST')
            return send(await service.resetScoringSettings(listId));
        }
        if (
          wishlist &&
          (path.startsWith('/api/v1/steam/') || path.startsWith('/api/v1/wishlist'))
        ) {
          const hit = await wishlistRoute(wishlist, req, url, readJson);
          if (hit) return send(hit.data, hit.status);
        }
        if (path.startsWith('/api/')) throw new AppError('Rota não encontrada', 404);
        if (req.method !== 'GET') throw new AppError('Método não permitido', 405);
        const base = resolve(root, '../web/dist');
        let target = resolve(base, '.' + decodeURIComponent(path));
        if (!target.startsWith(base + sep)) target = resolve(base, 'index.html');
        let content;
        try {
          content = await readFile(target);
        } catch {
          target = resolve(base, 'index.html');
          content = await readFile(target);
        }
        const mime: Record<string, string> = {
          '.html': 'text/html; charset=utf-8',
          '.js': 'text/javascript',
          '.css': 'text/css',
          '.svg': 'image/svg+xml',
          '.ico': 'image/x-icon',
          '.png': 'image/png',
          '.webmanifest': 'application/manifest+json',
        };
        res.setHeader('Content-Type', mime[extname(target)] ?? 'application/octet-stream');
        res.end(content);
      } catch (e) {
        const { status, headers, body } = toProblem(e, requestId);
        if (res.headersSent) return void res.end();
        res.writeHead(status, {
          ...headers,
          'Content-Type': 'application/problem+json; charset=utf-8',
          'Cache-Control': 'no-store',
        });
        res.end(JSON.stringify(body));
      }
    });
  });
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const auth = authenticatorFromEnv();
  const host = process.env.HOST ?? '127.0.0.1';
  if (!auth) assertNoAuthAllowed(process.env, host);
  const { service, storage, wishlist } = await createService({
    dataDir: resolve(root, 'data'),
    // Sem auth (dev), os dados do Postgres são os do dono do seed.
    devAppUserId: auth ? undefined : SEED_APP_USER_ID,
  });
  const server = makeServer(service, auth, wishlist);
  if (!auth)
    logger.warn('server.no_auth', {
      note: 'SUPABASE_URL is unset: running WITHOUT authentication (local dev only)',
    });
  for (const signal of ['SIGTERM', 'SIGINT'] as const)
    process.on(signal, () => void flushLogs().finally(() => process.exit(0)));
  server.listen(Number(process.env.PORT) || 3000, host, () =>
    logger.info('server.listening', { storage, host, port: Number(process.env.PORT) || 3000 }),
  );
}
