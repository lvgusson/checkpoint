import type { IncomingMessage } from 'node:http';
import type { ConfigService } from '../services/config.ts';
import type { ReadJson, RouteResult } from './http.ts';

export async function configRoute(
  service: ConfigService,
  req: IncomingMessage,
  url: URL,
  readJson: ReadJson,
): Promise<RouteResult> {
  if (url.pathname === '/api/v1/config/options' && req.method === 'GET')
    return { data: await service.list() };
  const match = url.pathname.match(/^\/api\/v1\/config\/options\/([^/]+)$/);
  if (!match) return null;
  const category = decodeURIComponent(match[1]);
  if (req.method === 'POST')
    return { data: await service.add(category, await readJson()), status: 201 };
  if (req.method === 'DELETE') return { data: await service.remove(category, await readJson()) };
  return null;
}
