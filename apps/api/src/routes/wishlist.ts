// Rotas /api/v1/steam/* e /api/v1/wishlist/* (montadas em server.ts, já autenticadas).
import type { IncomingMessage } from 'node:http';
import type { WishlistService } from '../services/wishlist.ts';
import { ApiPath, HttpMethod, type ReadJson, type RouteResult } from './http.ts';

export async function wishlistRoute(
  wishlist: WishlistService,
  req: IncomingMessage,
  url: URL,
  readJson: ReadJson,
): Promise<RouteResult> {
  const path = url.pathname;
  const method = req.method;
  const optionalJson = () =>
    Number(req.headers['content-length'] ?? 0) > 0 || req.headers['transfer-encoding']
      ? readJson()
      : Promise.resolve({});
  if (path === ApiPath.SteamSearch && method === HttpMethod.Get)
    return { data: await wishlist.search(url.searchParams.get('q')) };
  const app = path.match(/^\/api\/v1\/steam\/apps\/([^/]+)$/);
  if (app && method === HttpMethod.Get)
    return { data: await wishlist.app(decodeURIComponent(app[1])) };
  if (path === ApiPath.Wishlist) {
    if (method === HttpMethod.Get)
      return { data: await wishlist.list(url.searchParams.get('sort') ?? undefined) };
    if (method === HttpMethod.Post) {
      const { item, created } = await wishlist.add(await readJson());
      return { data: { ...item, created }, status: created ? 201 : 200 };
    }
  }
  if (path === ApiPath.WishlistImportSteam && method === HttpMethod.Post)
    return { data: await wishlist.importSteam(await optionalJson()) };
  if (path === ApiPath.WishlistPricesRefresh && method === HttpMethod.Post)
    return { data: await wishlist.refreshPrices() };
  return null;
}
