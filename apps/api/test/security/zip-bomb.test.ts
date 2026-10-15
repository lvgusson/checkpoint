// Testes de segurança: ataque de bomba de descompressão (zip bomb / decompression bomb).
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { gzipSync, deflateSync } from 'node:zlib';
import { startTestServer, testFetch, type TestServerContext } from './helper.ts';

describe('Security: Zip Bomb / Decompression Bomb', () => {
  let ctx: TestServerContext;

  before(async () => {
    ctx = await startTestServer();
  });

  after(async () => {
    await ctx.close();
  });

  it('não descompacta corpos gzip enviados com Content-Encoding: gzip (rejeita como binário/JSON inválido)', async () => {
    // 5MB de dados altamente repetitivos compactados para ~5KB
    const uncompressed = Buffer.alloc(5 * 1024 * 1024, 0x41); // 5 MB de 'A'
    const compressed = gzipSync(uncompressed);
    assert.ok(compressed.length < 10_000, 'Payload compactado deve ter menos de 10 KB');

    const res = await testFetch(ctx.baseUrl, '/api/v1/lists', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Encoding': 'gzip',
      },
      body: compressed,
    });

    // O servidor não possui middleware de descompressão; lê os bytes brutos e falha em JSON.parse
    assert.equal(res.status, 400, 'Deve rejeitar com 400 (JSON inválido)');
    const body = await res.json();
    assert.equal(body.code, 'bad_request');
    assert.equal(body.detail, 'JSON inválido');

    // O servidor deve continuar responsivo imediatamente
    const health = await testFetch(ctx.baseUrl, '/api/v1/health');
    assert.equal(health.status, 200, 'Servidor deve continuar ativo e responsivo');
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

    assert.equal(res.status, 400, 'Deve rejeitar payload deflate com 400');
    const health = await testFetch(ctx.baseUrl, '/api/v1/health');
    assert.equal(health.status, 200);
  });
});
