// Testes de segurança: path traversal em arquivos estáticos e store, injeção de cabeçalho (CRLF), CORS, method override, query strings imensas e percent-encoding malformado.
import { describe, it, beforeAll, afterAll, expect } from 'vitest';
import { request as httpRequest } from 'node:http';
import { startTestServer, testFetch, type TestServerContext } from './helper.ts';

describe('Security: HTTP Boundaries & Input Encodings', () => {
  let ctx: TestServerContext;

  beforeAll(async () => {
    ctx = await startTestServer();
  });

  afterAll(async () => {
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
      expect(status, `Traversal must return the web fallback: ${p}`).toBe(200);
      expect(contentType).toMatch(/text\/html/);
      expect(text).toMatch(/<html/i);
      expect(
        !text.includes('root:x:0:0:'),
        `Path traversal não deve entregar /etc/passwd: ${p}`,
      ).toBeTruthy();
      expect(
        !text.includes('"name": "checkpoint-games"'),
        `Path traversal não deve entregar o package.json raiz: ${p}`,
      ).toBeTruthy();
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
      expect(res.status, `Rota não deve falhar com 500: ${route}`).not.toBe(500);
      expect(
        !text.includes('"name": "checkpoint-games"'),
        `Não deve ler arquivos do sistema via parâmetro de rota: ${route}`,
      ).toBeTruthy();
    }
  });

  it('lida de forma segura com codificação percentual malformada (400)', async () => {
    const malformedPaths = ['/%', '/%c0%ae%c0%ae', '/api/v1/games/%', '/api/v1/games/%E0%A4%A'];

    for (const p of malformedPaths) {
      const res = await testFetch(ctx.baseUrl, p);
      expect(res.status, `Percent-encoding inválido em ${p} deve retornar 400 (Bad Request)`).toBe(
        400,
      );
      const body = await res.json();
      expect(body.code).toBe('bad_request');
      expect(body.detail).toBe('Codificação de URL inválida');
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

    expect(res.statusCode).toBe(200);
    const returnedReqId = res.headers['x-request-id'];
    expect(typeof returnedReqId === 'string').toBeTruthy();
    // Deve ignorar o header inválido e gerar um UUID seguro
    expect(returnedReqId, 'Deve substituir cabeçalho malformado por um UUID limpo').toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
    expect(res.headers['injected-header'], 'Nenhum cabeçalho injetado deve existir').toBe(
      undefined,
    );
  });

  it('não possui cabeçalhos CORS permissivos que reflitam origens arbitrárias', async () => {
    const res = await testFetch(ctx.baseUrl, '/api/v1/health', {
      headers: {
        Origin: 'https://attacker.evil.com',
      },
    });

    const acao = res.headers.get('Access-Control-Allow-Origin');
    expect(
      acao === null || acao !== 'https://attacker.evil.com',
      'Servidor não deve refletir origem de atacante em Access-Control-Allow-Origin',
    ).toBeTruthy();
    expect(acao, 'Servidor não deve ter Access-Control-Allow-Origin: * irrestrito').not.toBe('*');
  });

  it('ignora cabeçalhos de sobreposição de método HTTP (X-HTTP-Method-Override)', async () => {
    const games = await ctx.service.all();
    const game = games[0];
    expect(game).toBeTruthy();

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
    expect(res.status, 'POST não deve ser roteado como PATCH via X-HTTP-Method-Override').toBe(404);

    // Verifica que o jogo não foi alterado
    const checkGame = await ctx.service.repository.get(game.id);
    expect(checkGame?.name, 'O nome do jogo não deve ter sido alterado').toBe(game.name);
  });

  it('lida com query strings enormes sem quebrar nem estourar pilha (rejeita com 431 ou trata de forma limitada)', async () => {
    const hugeQuery = 'q=' + 'A'.repeat(50_000);
    const res = await testFetch(ctx.baseUrl, `/api/v1/games?${hugeQuery}`);

    expect(res.status, 'Query string imensa não deve provocar 500').not.toBe(500);
    // Node.js limita tamanho de cabeçalho com 431 (Request Header Fields Too Large) por padrão
    expect(
      [200, 400, 414, 431].includes(res.status),
      `Status esperado 200, 400, 414 ou 431, recebido: ${res.status}`,
    ).toBeTruthy();
  });
});
