import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AppError } from '../shared/errors.ts';
import { GameService } from '../services/games.ts';
import { createService } from './setup.ts';
import { SEED_APP_USER_ID } from '../services/auth-user.ts';
import { assertNoAuthAllowed, authenticatorFromEnv, type Authenticator } from '../auth/auth.ts';
import { can, Permission, Role } from '../../../../packages/core/src/authorization.ts';
import { toProblem } from '../routes/http-errors.ts';
import { flushLogs, logger, metrics } from '../observability/logger.ts';
import { telemetryRoute } from '../routes/telemetry.ts';
import { getContext, runWithContext, setContext } from '../shared/context.ts';
import type { WishlistService } from '../services/wishlist.ts';
import { wishlistRoute } from '../routes/wishlist.ts';
import { gamesRoute } from '../routes/games.ts';
import { listsRoute } from '../routes/lists.ts';
import { systemRoute } from '../routes/system.ts';
import { staticRoute } from '../routes/static.ts';
import { releaseRoute } from '../routes/releases.ts';
import { type ReleaseStore } from '../data/ports.ts';
import { releaseStoreFromEnv } from './data.ts';
import { ApiPath, ContentType, HttpMethod, type RouteResult } from '../routes/http.ts';
import { configRoute } from '../routes/config.ts';
import type { ConfigService } from '../services/config.ts';
import type { TrackService } from '../services/track.ts';
import { trackRoute } from '../routes/track.ts';
import {
  clientLatencyMs,
  detailEnabled,
  newTrace,
  serverTimingHeader,
  span,
  stageTable,
  traceStore,
} from '../observability/timing.ts';
import { createRequestGuard } from '../shared/request-guard.ts';
const root = fileURLToPath(new URL('../../', import.meta.url));
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
  config: ConfigService | null = null,
  track: TrackService | null = null,
) {
  const guardExpensive = createRequestGuard(60, 60_000, 10);
  return createServer((req, res) => {
    const incoming = req.headers['x-request-id'];
    const requestId =
      typeof incoming === 'string' && REQUEST_ID.test(incoming) ? incoming : randomUUID();
    const startedAt = performance.now();
    const trace = newTrace(
      clientLatencyMs(Date.now(), req.headers['x-client-sent-at'] as string | undefined),
    );
    const detailEnv = process.env.TIMING_DETAIL;
    res.setHeader('X-Request-Id', requestId);
    // Server-Timing must be set before headers go out, so build it at writeHead.
    // Stages after that (send) reach only the log line.
    let sendStart = 0n;
    const writeHead = res.writeHead;
    res.writeHead = function (this: typeof res, ...args: Parameters<typeof res.writeHead>) {
      if (!this.headersSent) {
        sendStart = process.hrtime.bigint();
        const detail = detailEnabled(
          detailEnv,
          req.headers['x-timing-detail'] as string,
          trace.authed,
        );
        this.setHeader('Server-Timing', serverTimingHeader(trace, sendStart, detail));
      }
      return writeHead.apply(this, args);
    } as typeof res.writeHead;
    for (const [k, v] of Object.entries(SECURITY_HEADERS)) res.setHeader(k, v);
    if (req.url?.startsWith(ApiPath.Root))
      res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
    let logged = false;
    const onDone = () => {
      if (logged) return;
      logged = true;
      const now = process.hrtime.bigint();
      const ms = Math.round(performance.now() - startedAt);
      const route = (req.url ?? '').split('?')[0];
      logger.info('http.request', {
        method: req.method,
        path: route,
        status: res.statusCode,
        ms,
        ...(detailEnv === '1' && {
          timing: stageTable(
            Object.assign(trace, { stages: { ...trace.stages, send: now - sendStart } }),
            now,
          ),
        }),
        aborted: !res.writableFinished,
        requestId,
      });
      metrics.timing('http.server.duration', ms, { method: req.method, status: res.statusCode });
    };
    res.on('finish', onDone);
    res.on('close', onDone); // aborted requests never emit finish
    return traceStore.run(trace, () =>
      runWithContext({ requestId }, async () => {
        const send = (data: unknown, status = 200) => {
          const body = span('ser', () => JSON.stringify(data));
          res.writeHead(status, {
            'Content-Type': ContentType.JsonUtf8,
            'Cache-Control': 'no-store',
          });
          res.end(body);
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
        const reply = (hit: Exclude<RouteResult, null>) => {
          if ('raw' in hit) {
            res.setHeader('Content-Type', hit.contentType);
            return res.end(hit.raw);
          }
          if (hit.status === 204) {
            res.writeHead(204, { 'Cache-Control': 'no-store' });
            return res.end();
          }
          return send(hit.data, hit.status);
        };
        try {
          const url = new URL(req.url ?? '/', 'http://localhost');
          const path = url.pathname;
          const system = await systemRoute(path, releases);
          if (system) return reply(system);
          // Public release reads and dedicated-token registration precede user authentication.
          if (path.startsWith(ApiPath.Releases)) {
            const hit = await releaseRoute(releases, req, url, readJson);
            if (hit) return reply(hit);
          }
          // Daqui em diante, toda rota /api/* exige JWT do Supabase (401 se ausente/inválido).
          if (auth && path.startsWith(ApiPath.Root)) {
            const user = await auth.authenticate(
              req.headers.authorization,
              req.socket.remoteAddress ?? '127.0.0.1',
            );
            setContext({
              userId: user.id,
              accessToken: user.accessToken,
              email: user.email,
              role: user.role,
            });
          } else if (path.startsWith(ApiPath.Root)) {
            setContext({ role: Role.Admin }); // no-auth dev mode
            trace.authed = true; // makeServer without auth runs only on localhost
          }
          const telemetry = await telemetryRoute(req.method, path, readJson);
          if (telemetry) return reply(telemetry);
          if (path.startsWith(ApiPath.Root)) {
            const read = req.method === HttpMethod.Get || req.method === HttpMethod.Head;
            need(
              path === ApiPath.Track
                ? Permission.GamesRead
                : !read && path.includes('/settings/')
                  ? Permission.SettingsUpdate
                  : read
                    ? Permission.GamesRead
                    : Permission.GamesUpdate,
            );
          }
          const isExpensive =
            path.endsWith('/recommendations') ||
            path === ApiPath.WishlistImportSteam ||
            path === ApiPath.WishlistPricesRefresh ||
            path === ApiPath.SteamSearch ||
            path.startsWith('/api/v1/steam/apps/');
          const dispatch = async () =>
            (await gamesRoute(service, req, url, readJson)) ??
            (await listsRoute(service, req, url, readJson)) ??
            (wishlist ? await wishlistRoute(wishlist, req, url, readJson) : null) ??
            (config ? await configRoute(config, req, url, readJson) : null) ??
            (track ? await trackRoute(track, req.method, path, readJson) : null);
          const isGet = req.method === HttpMethod.Get || req.method === HttpMethod.Head;
          const hit = await span('route', () =>
            isExpensive
              ? guardExpensive(
                  `${getContext()?.userId ?? 'local'}:${path}${url.search}`,
                  dispatch,
                  isGet,
                )
              : dispatch(),
          );
          if (hit) return reply(hit);
          if (path.startsWith(ApiPath.Root)) throw new AppError('Rota não encontrada', 404);
          if (req.method !== HttpMethod.Get) throw new AppError('Método não permitido', 405);
          return reply((await staticRoute(path))!);
        } catch (e) {
          const { status, headers, body } = toProblem(e, requestId);
          if (res.headersSent) return void res.end();
          res.writeHead(status, {
            ...headers,
            'Content-Type': ContentType.ProblemJson,
            'Cache-Control': 'no-store',
          });
          res.end(JSON.stringify(body));
        }
      }),
    );
  });
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const auth = authenticatorFromEnv();
  const host = process.env.HOST ?? '127.0.0.1';
  if (!auth) assertNoAuthAllowed(process.env, host);
  const { service, storage, wishlist, config, track } = await createService({
    dataDir: resolve(root, 'data'),
    // Sem auth (dev), os dados do Postgres são os do dono do seed.
    devAppUserId: auth ? undefined : SEED_APP_USER_ID,
  });
  const server = makeServer(service, auth, wishlist, releaseStoreFromEnv(), config, track);
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
