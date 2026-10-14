// Rotas /api/v1/steam/* e /api/v1/wishlist/* (montadas em server.ts, já autenticadas).
import type { IncomingMessage } from 'node:http';
import type { WishlistService } from './wishlist.ts';

type Body = Record<string, unknown>;
export type RouteResult = { data: unknown; status?: number } | null;

export async function wishlistRoute(
  wishlist: WishlistService,
  req: IncomingMessage,
  url: URL,
  readJson: () => Promise<Body>,
): Promise<RouteResult> {
  const path = url.pathname;
  const method = req.method;
  const optionalJson = () =>
    Number(req.headers['content-length'] ?? 0) > 0 || req.headers['transfer-encoding']
      ? readJson()
      : Promise.resolve({});
  if (path === '/api/v1/steam/search' && method === 'GET')
    return { data: await wishlist.search(url.searchParams.get('q')) };
  const app = path.match(/^\/api\/v1\/steam\/apps\/([^/]+)$/);
  if (app && method === 'GET') return { data: await wishlist.app(decodeURIComponent(app[1])) };
  if (path === '/api/v1/wishlist') {
    if (method === 'GET') return { data: await wishlist.list() };
    if (method === 'POST') {
      const { item, created } = await wishlist.add(await readJson());
      return { data: { ...item, created }, status: created ? 201 : 200 };
    }
  }
  if (path === '/api/v1/wishlist/import-steam' && method === 'POST')
    return { data: await wishlist.importSteam(await optionalJson()) };
  if (path === '/api/v1/wishlist/prices/refresh' && method === 'POST')
    return { data: await wishlist.refreshPrices() };
  return null;
}
