// Testes de segurança: corpos JSON superdimensionados, Content-Length ausente/falso, aninhamento profundo, prototype pollution e mass assignment.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { request as httpRequest } from 'node:http';
import { startTestServer, testFetch, type TestServerContext } from './helper.ts';

describe('Security: Payload Injection & JSON Limits', () => {
  let ctx: TestServerContext;

  before(async () => {
    ctx = await startTestServer();
  });

  after(async () => {
    await ctx.close();
  });

  it('rejeita corpo JSON com Content-Length maior que o limite (413)', async () => {
    const payload = JSON.stringify({ name: 'A'.repeat(120_000) });
    const res = await testFetch(ctx.baseUrl, '/api/v1/lists', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': String(Buffer.byteLength(payload)),
      },
      body: payload,
    });

    assert.equal(res.status, 413, 'Deve retornar 413 Payload Too Large');
    const body = await res.json();
    assert.equal(body.code, 'payload_too_large');
  });

  it('rejeita corpo JSON que mente sobre Content-Length ou excede em streaming chunked (413)', async () => {
    // Envia requisição com Content-Length menor que o tamanho real via streaming HTTP
    const status = await new Promise<number>((resolve, reject) => {
      const req = httpRequest(
        `${ctx.baseUrl}/api/v1/lists`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Transfer-Encoding': 'chunked',
          },
        },
        (res) => {
          res.resume();
          resolve(res.statusCode ?? 0);
        },
      );

      req.on('error', reject);

      const chunk = Buffer.from('{"name":"' + 'X'.repeat(40_000) + '",');
      req.write(chunk);
      req.write(chunk);
      req.write(chunk); // Total > 120KB > 100KB limite
      req.end('}');
    });

    assert.equal(status, 413, 'Streaming que ultrapassa 100KB deve ser interrompido com 413');
  });

  it('rejeita JSON com aninhamento excessivo sem vazar stack trace (400)', async () => {
    // Cria um JSON com 1000 níveis de profundidade
    let nested = '{"val": 1}';
    for (let i = 0; i < 600; i++) {
      nested = `{"nest":${nested}}`;
    }

    const res = await testFetch(ctx.baseUrl, '/api/v1/lists', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: nested,
    });

    assert.ok(
      res.status === 400 || res.status === 413,
      `Status esperado 400 ou 413, recebido ${res.status}`,
    );
    const text = await res.text();
    assert.ok(!text.includes('at '), 'A resposta não deve conter stack trace do Node.js');
  });

  it('bloqueia poluição de protótipo (__proto__) em rotas de atualização', async () => {
    const games = await ctx.service.all();
    const targetGame = games[0];
    assert.ok(targetGame, 'Deve haver ao menos um jogo no seed');

    // Envia string JSON explícita contendo a chave __proto__
    const payload = '{"__proto__": {"polluted": "true"}}';

    const res = await testFetch(ctx.baseUrl, `/api/v1/games/${encodeURIComponent(targetGame.id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: payload,
    });

    assert.equal(res.status, 400, 'Deve rejeitar campo __proto__ com 400');
    // Verifica que o protótipo global não foi poluído
    assert.equal(
      ({} as Record<string, unknown>).polluted,
      undefined,
      'Object.prototype não deve ser poluído',
    );
  });

  it('bloqueia poluição de protótipo via constructor', async () => {
    const games = await ctx.service.all();
    const targetGame = games[0];

    const payload = JSON.stringify({
      constructor: { prototype: { admin: true } },
    });

    const res = await testFetch(ctx.baseUrl, `/api/v1/games/${encodeURIComponent(targetGame.id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: payload,
    });

    assert.equal(res.status, 400, 'Deve rejeitar campo constructor com 400');
    assert.equal(
      ({} as Record<string, unknown>).admin,
      undefined,
      'Object.prototype não deve ter admin injetado',
    );
  });

  it('bloqueia mass assignment de campos protegidos (owner, role, id, user_id)', async () => {
    const games = await ctx.service.all();
    const targetGame = games[0];

    const payload = JSON.stringify({
      id: '00000000-0000-0000-0000-000000000000',
      owner: 'attacker',
      role: 'admin',
      userId: 'attacker-sub',
      user_id: 'attacker-sub',
      rating: 5,
    });

    const res = await testFetch(ctx.baseUrl, `/api/v1/games/${encodeURIComponent(targetGame.id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: payload,
    });

    assert.equal(res.status, 400, 'Deve rejeitar payload com campos protegidos');
    const body = await res.json();
    assert.ok(
      body.detail.includes('Campo não editável'),
      'Deve informar que o campo não é editável',
    );

    // Confirma que o jogo original não teve seu id ou campos alterados
    const freshGame = await ctx.service.repository.get(targetGame.id);
    assert.equal(freshGame?.id, targetGame.id, 'O ID do jogo não deve ter mudado');
  });
});
