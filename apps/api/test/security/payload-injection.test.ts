// Testes de segurança: corpos JSON superdimensionados, Content-Length ausente/falso, aninhamento profundo, prototype pollution e mass assignment.
import { describe, it, beforeAll, afterAll, expect } from 'vitest';
import { request as httpRequest } from 'node:http';
import { startTestServer, testFetch, type TestServerContext } from './helper.ts';

describe('Security: Payload Injection & JSON Limits', () => {
  let ctx: TestServerContext;

  beforeAll(async () => {
    ctx = await startTestServer();
  });

  afterAll(async () => {
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

    expect(res.status, 'Deve retornar 413 Payload Too Large').toBe(413);
    const body = await res.json();
    expect(body.code).toBe('payload_too_large');
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

    expect(status, 'Streaming que ultrapassa 100KB deve ser interrompido com 413').toBe(413);
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

    expect(
      res.status === 400 || res.status === 413,
      `Status esperado 400 ou 413, recebido ${res.status}`,
    ).toBeTruthy();
    const text = await res.text();
    expect(!text.includes('at '), 'A resposta não deve conter stack trace do Node.js').toBeTruthy();
  });

  it('bloqueia poluição de protótipo (__proto__) em rotas de atualização', async () => {
    const games = await ctx.service.all();
    const targetGame = games[0];
    expect(targetGame, 'Deve haver ao menos um jogo no seed').toBeTruthy();

    // Envia string JSON explícita contendo a chave __proto__
    const payload = '{"__proto__": {"polluted": "true"}}';

    const res = await testFetch(ctx.baseUrl, `/api/v1/games/${encodeURIComponent(targetGame.id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: payload,
    });

    expect(res.status, 'Deve rejeitar campo __proto__ com 400').toBe(400);
    // Verifica que o protótipo global não foi poluído
    expect(({} as Record<string, unknown>).polluted, 'Object.prototype não deve ser poluído').toBe(
      undefined,
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

    expect(res.status, 'Deve rejeitar campo constructor com 400').toBe(400);
    expect(
      ({} as Record<string, unknown>).admin,
      'Object.prototype não deve ter admin injetado',
    ).toBe(undefined);
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

    expect(res.status, 'Deve rejeitar payload com campos protegidos').toBe(400);
    const body = await res.json();
    expect(
      body.detail.includes('Campo não editável'),
      'Deve informar que o campo não é editável',
    ).toBeTruthy();

    // Confirma que o jogo original não teve seu id ou campos alterados
    const freshGame = await ctx.service.repository.get(targetGame.id);
    expect(freshGame?.id, 'O ID do jogo não deve ter mudado').toBe(targetGame.id);
  });
});
