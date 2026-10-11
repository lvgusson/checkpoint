import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GameService, AppError, desires } from './service.ts';
import { createService } from './setup.ts';
import { SEED_APP_USER_ID } from './app-user.ts';
import { authenticatorFromEnv, publicAuthConfig, type Authenticator } from './auth.ts';
import { runWithContext, setContext } from './context.ts';
import { currentVersion } from './version.ts';
import { runInBackground } from './background.ts';
const root = fileURLToPath(new URL('../../', import.meta.url));
// auth: null desliga a autenticação (dev/testes sem SUPABASE_URL). Ver api/src/auth.ts.
export function makeServer(
  service: GameService,
  auth: Authenticator | null = authenticatorFromEnv(),
) {
  return createServer((req, res) =>
    runWithContext({}, async () => {
      const send = (data: unknown, status = 200) => {
        res.writeHead(status, {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'no-store',
        });
        res.end(JSON.stringify(data));
      };
      const readJson = async (): Promise<Record<string, unknown>> => {
        let data = '';
        for await (const chunk of req) {
          data += chunk;
          if (data.length > 100000) throw new AppError('Conteúdo muito grande', 413);
        }
        let body;
        try {
          body = JSON.parse(data);
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
          res.end(await readFile(resolve(root, 'docs/openapi.json')));
          return;
        }
        if (path === '/api/v1/config') return send(publicAuthConfig());
        if (path === '/api/v1/version') return send(await currentVersion());
        // Daqui em diante, toda rota /api/* exige JWT do Supabase (401 se ausente/inválido).
        if (auth && path.startsWith('/api/')) {
          const user = await auth.authenticate(req.headers.authorization);
          setContext({ userId: user.id, accessToken: user.accessToken, email: user.email });
        }
        if (path === '/api/v1/catalog' && req.method === 'GET')
          return send(await service.catalog());
        if (path === '/api/v1/recommendations' && req.method === 'GET')
          return send(await service.recommendations());
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
        if (path === '/api/v1/queue/reorder' && req.method === 'POST') {
          const body = await readJson();
          // 200 assim que validar; o recálculo e a gravação continuam depois da resposta.
          const { accepted, done } = await service.reorder(body.gameId, body.toPosition);
          runInBackground(done);
          return send(accepted);
        }
        if (path === '/api/v1/queue/adjustments' && req.method === 'GET')
          return send(await service.manualState());
        const manualMatch = path.match(/^\/api\/v1\/queue\/adjustments\/([^/]+)$/);
        if (manualMatch && req.method === 'DELETE')
          return send(await service.resetManual(decodeURIComponent(manualMatch[1])));
        if (path === '/api/v1/settings/scoring') {
          if (req.method === 'GET') return send(await service.scoringSettings());
          if (req.method === 'PUT')
            return send(await service.saveScoringSettings(await readJson()));
        }
        if (path === '/api/v1/settings/scoring/reset' && req.method === 'POST')
          return send(await service.resetScoringSettings());
        if (path.startsWith('/api/')) throw new AppError('Rota não encontrada', 404);
        if (req.method !== 'GET') throw new AppError('Método não permitido', 405);
        const base = resolve(root, 'dist/web/browser');
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
        };
        res.setHeader('Content-Type', mime[extname(target)] ?? 'application/octet-stream');
        res.end(content);
      } catch (e) {
        send(
          { error: { message: e instanceof Error ? e.message : 'Erro interno' } },
          e instanceof AppError ? e.code : 500,
        );
      }
    }),
  );
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const auth = authenticatorFromEnv();
  const { service, storage } = await createService({
    dataDir: resolve(root, 'api/data'),
    // Sem auth (dev), os dados do Postgres são os do dono do seed.
    devAppUserId: auth ? undefined : SEED_APP_USER_ID,
  });
  const server = makeServer(service, auth);
  if (!auth)
    console.warn('Aviso: SUPABASE_URL ausente — API rodando SEM autenticação (somente dev).');
  server.listen(Number(process.env.PORT) || 3000, process.env.HOST ?? '127.0.0.1', () =>
    console.log(`Checkpoint (${storage}): http://localhost:` + (process.env.PORT ?? 3000)),
  );
}
