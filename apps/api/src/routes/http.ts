// Shared HTTP vocabulary: methods, content types and the fixed API paths used by more than one module.
export const HttpMethod = {
  Get: 'GET',
  Head: 'HEAD',
  Post: 'POST',
  Put: 'PUT',
  Patch: 'PATCH',
  Delete: 'DELETE',
} as const;
export type HttpMethod = (typeof HttpMethod)[keyof typeof HttpMethod];

export const ContentType = {
  Json: 'application/json',
  JsonUtf8: 'application/json; charset=utf-8',
  ProblemJson: 'application/problem+json; charset=utf-8',
  HtmlUtf8: 'text/html; charset=utf-8',
  JavaScript: 'text/javascript',
  Css: 'text/css',
  Svg: 'image/svg+xml',
  Icon: 'image/x-icon',
  Png: 'image/png',
  WebManifest: 'application/manifest+json',
  OctetStream: 'application/octet-stream',
} as const;

export const ApiPath = {
  Root: '/api/',
  Health: '/api/v1/health',
  OpenApi: '/api/v1/openapi.json',
  Config: '/api/v1/config',
  Version: '/api/v1/version',
  Telemetry: '/api/v1/telemetry',
  Catalog: '/api/v1/catalog',
  GamesSearch: '/api/v1/games/search',
  Games: '/api/v1/games',
  Lists: '/api/v1/lists',
  Releases: '/api/v1/releases',
  ReleasesLatest: '/api/v1/releases/latest',
  SteamSearch: '/api/v1/steam/search',
  Steam: '/api/v1/steam/',
  Wishlist: '/api/v1/wishlist',
  WishlistImportSteam: '/api/v1/wishlist/import-steam',
  WishlistPricesRefresh: '/api/v1/wishlist/prices/refresh',
} as const;

/** What a route answers: JSON (default status 200; 204 sends no body), or a raw body. null = not this route. */
export type RouteResult =
  { data?: unknown; status?: number } | { raw: Buffer; contentType: string } | null;
export type ReadJson = (maxBytes?: number) => Promise<Record<string, unknown>>;
