// Rotas sem autenticação de usuário: health, contrato OpenAPI, configuração pública e versão.
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { publicAuthConfig } from '../auth/auth.ts';
import { currentVersion } from '../services/version.ts';
import type { ReleaseStore } from '../data/ports.ts';
import { ApiPath, ContentType, type RouteResult } from './http.ts';

const root = fileURLToPath(new URL('../../', import.meta.url));

export async function systemRoute(
  path: string,
  releases: ReleaseStore | null,
): Promise<RouteResult> {
  if (path === ApiPath.Health) return { data: { status: 'ok' } };
  if (path === ApiPath.OpenApi)
    return { raw: await readFile(resolve(root, 'openapi.json')), contentType: ContentType.Json };
  if (path === ApiPath.Config) return { data: publicAuthConfig() };
  if (path === ApiPath.Version) return { data: await currentVersion(releases) };
  return null;
}
