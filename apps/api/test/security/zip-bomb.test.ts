// Testes de segurança: ataque de bomba de descompressão (zip bomb / decompression bomb).
import { describe, it, beforeAll, afterAll, expect } from 'vitest';
import { gzipSync, deflateSync } from 'node:zlib';
import { startTestServer, testFetch, type TestServerContext } from './helper.ts';

describe('Security: Zip Bomb / Decompression Bomb', () => {
  let ctx: TestServerContext;

  beforeAll(async () => {
    ctx = await startTestServer();
  });

  afterAll(async () => {
    await ctx.close();
  });

  it('não descompacta corpos gzip enviados com Content-Encoding: gzip (rejeita como binário/JSON inválido)', async () => {
    // 5MB de dados altamente repetitivos compactados para ~5KB
    const uncompressed = Buffer.alloc(5 * 1024 * 1024, 0x41); // 5 MB de 'A'
    const compressed = gzipSync(uncompressed);
    expect(compressed.length < 10_000, 'Payload compactado deve ter menos de 10 KB').toBeTruthy();

    const res = await testFetch(ctx.baseUrl, '/api/v1/lists', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Encoding': 'gzip',
      },
      body: compressed,
    });

    // O servidor não possui middleware de descompressão; lê os bytes brutos e falha em JSON.parse
    expect(res.status, 'Deve rejeitar com 400 (JSON inválido)').toBe(400);
    const body = await res.json();
    expect(body.code).toBe('bad_request');
    expect(body.detail).toBe('JSON inválido');

    // O servidor deve continuar responsivo imediatamente
    const health = await testFetch(ctx.baseUrl, '/api/v1/health');
    expect(health.status, 'Servidor deve continuar ativo e responsivo').toBe(200);
  });

  it('não descompacta corpos deflate enviados com Content-Encoding: deflate (rejeita com 400)', async () => {
    const uncompressed = Buffer.alloc(5 * 1024 * 1024, 0x42);
    const compressed = deflateSync(uncompressed);

    const res = await testFetch(ctx.baseUrl, '/api/v1/lists', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Encoding': 'deflate',
      },
      body: compressed,
    });

    expect(res.status, 'Deve rejeitar payload deflate com 400').toBe(400);
    const health = await testFetch(ctx.baseUrl, '/api/v1/health');
    expect(health.status).toBe(200);
  });
});
