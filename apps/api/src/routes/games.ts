// Rotas /api/v1/catalog, /api/v1/games, /api/v1/games/search e /api/v1/games/:id.
import type { IncomingMessage } from 'node:http';
import { AppError } from '../shared/errors.ts';
import type { GameService } from '../services/games.ts';
import { ApiPath, HttpMethod, type ReadJson, type RouteResult } from './http.ts';

export async function gamesRoute(
  service: GameService,
  req: IncomingMessage,
  url: URL,
  readJson: ReadJson,
): Promise<RouteResult> {
  const path = url.pathname;
  const method = req.method;
  if (path === ApiPath.Catalog && method === HttpMethod.Get)
    return { data: await service.catalog() };
  if (path === ApiPath.GamesSearch && method === HttpMethod.Get)
    return {
      data: await service.searchGames(
        url.searchParams.get('q') ?? '',
        url.searchParams.get('excludeId') ?? undefined,
      ),
    };
  if (path === ApiPath.Games && method === HttpMethod.Get) {
    const p = url.searchParams;
    return {
      data: await service.browse({
        q: p.get('q'),
        status: p.get('status'),
        primaryGenre: p.get('primaryGenre'),
        store: p.get('store'),
        sort: p.get('sort'),
        page: p.get('page'),
        pageSize: p.get('pageSize'),
      }),
    };
  }
  const purchase = path.match(/^\/api\/v1\/games\/([^/]+)\/purchase$/);
  if (purchase && method === HttpMethod.Post) {
    const body =
      Number(req.headers['content-length'] ?? 0) > 0 || req.headers['transfer-encoding']
        ? await readJson()
        : {};
    if (Object.keys(body).length) throw new AppError('A compra não aceita campos');
    return { data: await service.purchase(decodeURIComponent(purchase[1])) };
  }
  const unpurchase = path.match(/^\/api\/v1\/games\/([^/]+)\/unpurchase$/);
  if (unpurchase && method === HttpMethod.Post) {
    const body =
      Number(req.headers['content-length'] ?? 0) > 0 || req.headers['transfer-encoding']
        ? await readJson()
        : {};
    if (Object.keys(body).length) throw new AppError('A desmarcação de compra não aceita campos');
    return { data: await service.unpurchase(decodeURIComponent(unpurchase[1])) };
  }
  const match = path.match(/^\/api\/v1\/games\/([^/]+)$/);
  if (match) {
    const id = decodeURIComponent(match[1]);
    if (method === HttpMethod.Get) return { data: await service.game(id) };
    if (method === HttpMethod.Patch) return { data: await service.patch(id, await readJson()) };
  }
  return null;
}
