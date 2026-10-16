// The Vercel function (apps/api/index.mjs) forwards each request to Fastify's http.Server.
// This test calls the exported handler through a plain node:http server, as the Vercel runtime does.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createServer, type Server } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';

describe('Vercel entry (apps/api/index.mjs)', () => {
  let server: Server;
  let base: string;
  let dataDir: string;

  beforeAll(async () => {
    dataDir = await mkdtemp(join(tmpdir(), 'cp-vercel-'));
    vi.stubEnv('DATABASE_URL', '');
    vi.stubEnv('SUPABASE_URL', '');
    vi.stubEnv('DATA_DIR', dataDir);
    const { default: handler } = await import('../index.mjs');
    server = createServer(handler);
    await new Promise<void>((ok) => server.listen(0, '127.0.0.1', ok));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    server.closeAllConnections();
    await new Promise((ok) => server.close(ok));
    await rm(dataDir, { recursive: true, force: true });
    vi.unstubAllEnvs();
  });

  it('answers /api/v1/health with security headers', async () => {
    const res = await fetch(`${base}/api/v1/health`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'ok' });
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('x-request-id')).toBeTruthy();
    expect(res.headers.get('server-timing')).toBeTruthy();
  });

  it('answers an unknown API route with problem+json', async () => {
    const res = await fetch(`${base}/api/v1/nope`);
    expect(res.status).toBe(404);
    expect(res.headers.get('content-type')).toContain('application/problem+json');
  });
});
