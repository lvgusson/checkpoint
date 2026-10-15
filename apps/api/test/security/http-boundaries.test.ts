// Testes de segurança: path traversal em arquivos estáticos e store, injeção de cabeçalho (CRLF), CORS, method override, query strings imensas e percent-encoding malformado.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { request as httpRequest } from 'node:http';
import { startTestServer, testFetch, type TestServerContext } from './helper.ts';

describe('Security: HTTP Boundaries & Input Encodings', () => {
  let ctx: TestServerContext;

  before(async () => {
    ctx = await startTestServer();
  });

  after(async () => {
    await ctx.close();
  });

  it('bloqueia path traversal na entrega de arquivos estáticos (/../../)', async () => {
    const traversalPaths = [
      '/../../../../etc/passwd',
      '/..%2f..%2f..%2f..%2fetc%2fpasswd',
      '/..%252f..%252fpackage.json',
      '/static/../../package.json',
    ];

    for (const p of traversalPaths) {
      // Raw HTTP preserves parent segments that fetch normalizes before transmission.
      const { status, contentType, text } = await new Promise<{
        status: number;
        contentType: string;
        text: string;
      }>((resolve, reject) => {
        const request = httpRequest(
          { hostname: '127.0.0.1', port: ctx.port, path: p },
          (response) => {
            let text = '';
            response.setEncoding('utf8');
            response.on('data', (chunk) => {
              text += chunk;
            });
            response.on('end', () =>
              resolve({
                status: response.statusCode ?? 0,
                contentType: String(response.headers['content-type'] ?? ''),
                text,
              }),
            );
          },
        );
        request.on('error', reject);
        request.end();
      });
      assert.equal(status, 200, `Traversal must return the web fallback: ${p}`);
      assert.match(contentType, /text\/html/);
      assert.match(text, /<html/i);
      assert.ok(
        !text.includes('root:x:0:0:'),
        `Path traversal não deve entregar /etc/passwd: ${p}`,
      );
      assert.ok(
        !text.includes('"name": "checkpoint-games"'),
        `Path traversal não deve entregar o package.json raiz: ${p}`,
      );
    }
  });

  it('bloqueia path traversal nas rotas de API com armazenamento em arquivo', async () => {
    const traversalRoutes = [
      '/api/v1/games/..%2f..%2fpackage.json',
      '/api/v1/lists/..%2f..%2fpackage.json',
      '/api/v1/steam/apps/..%2f..%2fpackage.json',
    ];

    for (const route of traversalRoutes) {
      const res = await testFetch(ctx.baseUrl, route);
      const text = await res.text();
      assert.notEqual(res.status, 500, `Rota não deve falhar com 500: ${route}`);
      assert.ok(
        !text.includes('"name": "checkpoint-games"'),
        `Não deve ler arquivos do sistema via parâmetro de rota: ${route}`,
      );
    }
  });

  it('lida de forma segura com codificação percentual malformada (400)', async () => {
    const malformedPaths = ['/%', '/%c0%ae%c0%ae', '/api/v1/games/%', '/api/v1/games/%E0%A4%A'];

    for (const p of malformedPaths) {
      const res = await testFetch(ctx.baseUrl, p);
      assert.equal(
        res.status,
        400,
        `Percent-encoding inválido em ${p} deve retornar 400 (Bad Request)`,
      );
      const body = await res.json();
      assert.equal(body.code, 'bad_request');
      assert.equal(body.detail, 'Codificação de URL inválida');
    }
  });

  it('previne injeção de cabeçalhos HTTP (CRLF) via X-Request-Id', async () => {
    // Tenta injetar cabeçalho malicioso através de X-Request-Id
    const res = await new Promise<{
      statusCode: number;
      headers: Record<string, string | string[] | undefined>;
    }>((resolve, reject) => {
      // Como a API valida com /^[\w.-]{8,64}$/, envia valor com espaços ou caracteres especiais
      const req = httpRequest(
        `${ctx.baseUrl}/api/v1/health`,
        {
          headers: {
            'X-Request-Id': 'invalid_id_with_space and_more_text',
          },
        },
        (r) => {
          resolve({ statusCode: r.statusCode ?? 0, headers: r.headers });
        },
      );
      req.on('error', reject);
      req.end();
    });

    assert.equal(res.statusCode, 200);
    const returnedReqId = res.headers['x-request-id'];
    assert.ok(typeof returnedReqId === 'string');
    // Deve ignorar o header inválido e gerar um UUID seguro
    assert.match(
      returnedReqId,
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      'Deve substituir cabeçalho malformado por um UUID limpo',
    );
    assert.equal(
      res.headers['injected-header'],
      undefined,
      'Nenhum cabeçalho injetado deve existir',
    );
  });

  it('não possui cabeçalhos CORS permissivos que reflitam origens arbitrárias', async () => {
    const res = await testFetch(ctx.baseUrl, '/api/v1/health', {
      headers: {
        Origin: 'https://attacker.evil.com',
      },
    });

    const acao = res.headers.get('Access-Control-Allow-Origin');
    assert.ok(
      acao === null || acao !== 'https://attacker.evil.com',
      'Servidor não deve refletir origem de atacante em Access-Control-Allow-Origin',
    );
    assert.notEqual(acao, '*', 'Servidor não deve ter Access-Control-Allow-Origin: * irrestrito');
  });

  it('ignora cabeçalhos de sobreposição de método HTTP (X-HTTP-Method-Override)', async () => {
    const games = await ctx.service.all();
    const game = games[0];
    assert.ok(game);

    // Envia POST com X-HTTP-Method-Override: PATCH para tentar modificar o jogo
    const res = await testFetch(ctx.baseUrl, `/api/v1/games/${encodeURIComponent(game.id)}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-HTTP-Method-Override': 'PATCH',
      },
      body: JSON.stringify({ name: 'Method Override Name' }),
    });

    // POST não é permitido nessa rota (somente GET e PATCH)
    assert.equal(
      res.status,
      404,
      'POST não deve ser roteado como PATCH via X-HTTP-Method-Override',
    );

    // Verifica que o jogo não foi alterado
    const checkGame = await ctx.service.repository.get(game.id);
    assert.equal(checkGame?.name, game.name, 'O nome do jogo não deve ter sido alterado');
  });

  it('lida com query strings enormes sem quebrar nem estourar pilha (rejeita com 431 ou trata de forma limitada)', async () => {
    const hugeQuery = 'q=' + 'A'.repeat(50_000);
    const res = await testFetch(ctx.baseUrl, `/api/v1/games?${hugeQuery}`);

    assert.notEqual(res.status, 500, 'Query string imensa não deve provocar 500');
    // Node.js limita tamanho de cabeçalho com 431 (Request Header Fields Too Large) por padrão
    assert.ok(
      [200, 400, 414, 431].includes(res.status),
      `Status esperado 200, 400, 414 ou 431, recebido: ${res.status}`,
    );
  });
});
