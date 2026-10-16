import fastify, { type FastifyReply, type FastifyRequest } from 'fastify';
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
  const traces = new WeakMap<FastifyRequest, ReturnType<typeof newTrace>>();
  const problem = (e: unknown, request: FastifyRequest, reply: FastifyReply) => {
    if (!reply.hasHeader('X-Request-Id')) begin(request, reply); // framework errors (bad URL) skip the hooks
    const { status, headers, body } = toProblem(e, request.id);
    return reply
      .code(status)
      .headers({ ...headers, 'Cache-Control': 'no-store' })
      .type(ContentType.ProblemJson)
      .send(JSON.stringify(body));
  };
  const app = fastify({
    logger: false, // the project logger (observability/logger.ts) writes the request log
    requestIdHeader: false, // genReqId alone decides: only a well-formed X-Request-Id is trusted
    genReqId: (req) => {
      const incoming = req.headers['x-request-id'];
      return typeof incoming === 'string' && REQUEST_ID.test(incoming) ? incoming : randomUUID();
    },
    frameworkErrors: problem, // bad URL encoding fails before any hook or route runs
    exposeHeadRoutes: false, // `all` already covers HEAD
    // Keep the node:http defaults that Fastify overrides.
    keepAliveTimeout: 5_000,
    requestTimeout: 300_000,
  });
  // The routes read the body themselves (readJson, with per-route limits, after auth).
  // This parser only stops Fastify from consuming the stream first.
  app.removeAllContentTypeParsers();
  app.addContentTypeParser('*', (_req, _payload, done) => done(null));
  // Runs for every request (onRequest hook): headers, trace, Server-Timing, request log.
  const begin = (request: FastifyRequest, reply: FastifyReply) => {
    const req = request.raw;
    const res = reply.raw;
    const startedAt = performance.now();
    const trace = newTrace(
      clientLatencyMs(Date.now(), req.headers['x-client-sent-at'] as string | undefined),
    );
    traces.set(request, trace);
    const detailEnv = process.env.TIMING_DETAIL;
    reply.header('X-Request-Id', request.id).headers(SECURITY_HEADERS);
    if (req.url?.startsWith(ApiPath.Root))
      reply.header('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
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
    let logged = false;
    const onDone = () => {
      if (logged) return;
      logged = true;
      const now = process.hrtime.bigint();
      const ms = Math.round(performance.now() - startedAt);
      logger.info('http.request', {
        method: req.method,
        path: (req.url ?? '').split('?')[0],
        status: res.statusCode,
        ms,
        ...(detailEnv === '1' && {
          timing: stageTable(
            Object.assign(trace, { stages: { ...trace.stages, send: now - sendStart } }),
            now,
          ),
        }),
        aborted: !res.writableFinished,
        requestId: request.id,
      });
      metrics.timing('http.server.duration', ms, { method: req.method, status: res.statusCode });
    };
    res.once('finish', onDone);
    res.once('close', onDone); // aborted requests never emit finish
  };
  app.setErrorHandler(problem);
  app.addHook('onRequest', async (request, reply) => begin(request, reply));
  const send = (reply: FastifyReply, hit: Exclude<RouteResult, null>) => {
    if ('raw' in hit) return reply.type(hit.contentType).send(hit.raw);
    reply.header('Cache-Control', 'no-store');
    if (hit.status === 204) return reply.code(204).send();
    return reply
      .code(hit.status ?? 200)
      .type(ContentType.JsonUtf8)
      .send(span('ser', () => JSON.stringify(hit.data)));
  };
  const handle = (request: FastifyRequest, reply: FastifyReply) => {
    const trace = traces.get(request)!;
    return traceStore.run(trace, () =>
      runWithContext({ requestId: request.id }, async () => {
        const req = request.raw;
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
        const url = new URL(req.url ?? '/', 'http://localhost');
        const path = url.pathname;
        const system = await systemRoute(path, releases);
        if (system) return send(reply, system);
        // Public release reads and dedicated-token registration precede user authentication.
        if (path.startsWith(ApiPath.Releases)) {
          const hit = await releaseRoute(releases, req, url, readJson);
          if (hit) return send(reply, hit);
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
        if (telemetry) return send(reply, telemetry);
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
        if (hit) return send(reply, hit);
        if (path.startsWith(ApiPath.Root)) throw new AppError('Rota não encontrada', 404);
        if (req.method !== HttpMethod.Get) throw new AppError('Método não permitido', 405);
        return send(reply, (await staticRoute(path))!);
      }),
    );
  };
  // One catch-all: the routes/*.ts modules still match their own paths.
  app.all('/*', handle);
  app.setNotFoundHandler(handle); // methods that `all` does not cover
  return app;
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
  const port = Number(process.env.PORT) || 3000;
  await server.listen({ port, host });
  logger.info('server.listening', { storage, host, port });
}
