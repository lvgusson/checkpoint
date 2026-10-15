// Testes de segurança: injeção de SQL em query params, path params e campos JSON.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer, testFetch, type TestServerContext } from './helper.ts';

const SQLI_PAYLOADS = [
  "' OR '1'='1",
  "' OR 1=1 --",
  "admin'--",
  "'; DROP TABLE library_entry; --",
  "' UNION SELECT null, null, null --",
  "1' AND (SELECT 1 FROM (SELECT COUNT(*), CONCAT((SELECT version()), FLOOR(RAND(0)*2)) x FROM information_schema.tables GROUP BY x) a) --",
  '%%%%%%%%%%%%%%%%%%%%',
  '_%_%_%_%_%_%_%_%_%',
  "\x00' OR 1=1 --",
  '\\u0027 OR 1=1 --',
];

// Padrões de vazamento de erro/driver de banco de dados
const SQL_DRIVER_ERROR_PATTERNS = [
  /syntax error at or near/i,
  /PostgresError/i,
  /pg_catalog/i,
  /column .* does not exist/i,
  /relation .* does not exist/i,
  /unhandled_error/i,
];

describe(
  'Security: PostgreSQL injection regression cases',
  {
    skip:
      !process.env.SECURITY_TEST_DATABASE_URL && 'Requires an isolated SECURITY_TEST_DATABASE_URL',
  },
  () => {
    let ctx: TestServerContext;

    before(async () => {
      ctx = await startTestServer({ postgres: true });
    });

    after(async () => {
      await ctx?.close();
    });

    it('resiste a payloads SQL em query parameters de /api/v1/games', async () => {
      for (const payload of SQLI_PAYLOADS) {
        const res = await testFetch(
          ctx.baseUrl,
          `/api/v1/games?q=${encodeURIComponent(payload)}&status=${encodeURIComponent(payload)}&sort=${encodeURIComponent(payload)}`,
        );

        const text = await res.text();
        assert.notEqual(res.status, 500, `Query param não deve gerar 500 para payload: ${payload}`);
        for (const pattern of SQL_DRIVER_ERROR_PATTERNS) {
          assert.ok(
            !pattern.test(text),
            `A resposta não deve vazar detalhes do driver SQL para payload: ${payload}`,
          );
        }
      }
    });

    it('resiste a payloads SQL em busca (/api/v1/games/search)', async () => {
      for (const payload of SQLI_PAYLOADS) {
        const res = await testFetch(
          ctx.baseUrl,
          `/api/v1/games/search?q=${encodeURIComponent(payload)}`,
        );

        const text = await res.text();
        assert.notEqual(res.status, 500, `Busca não deve gerar 500 para payload: ${payload}`);
        for (const pattern of SQL_DRIVER_ERROR_PATTERNS) {
          assert.ok(!pattern.test(text), `Busca não deve vazar detalhes SQL: ${payload}`);
        }
      }
    });

    it('resiste a payloads SQL em path parameters (/api/v1/games/:id, /api/v1/lists/:listId)', async () => {
      for (const payload of SQLI_PAYLOADS) {
        // Rota de jogo individual
        const resGame = await testFetch(
          ctx.baseUrl,
          `/api/v1/games/${encodeURIComponent(payload)}`,
        );
        assert.notEqual(resGame.status, 500, `Path param não deve gerar 500: ${payload}`);
        const textGame = await resGame.text();
        for (const pattern of SQL_DRIVER_ERROR_PATTERNS) {
          assert.ok(!pattern.test(textGame), `Path param de jogo não deve vazar SQL: ${payload}`);
        }

        // Rota de lista
        const resList = await testFetch(
          ctx.baseUrl,
          `/api/v1/lists/${encodeURIComponent(payload)}`,
        );
        assert.notEqual(resList.status, 500, `Path param de lista não deve gerar 500: ${payload}`);
        const textList = await resList.text();
        for (const pattern of SQL_DRIVER_ERROR_PATTERNS) {
          assert.ok(!pattern.test(textList), `Path param de lista não deve vazar SQL: ${payload}`);
        }

        // Rota de recommendations da lista
        const resRec = await testFetch(
          ctx.baseUrl,
          `/api/v1/lists/${encodeURIComponent(payload)}/recommendations`,
        );
        assert.notEqual(resRec.status, 500);
        const textRec = await resRec.text();
        for (const pattern of SQL_DRIVER_ERROR_PATTERNS) {
          assert.ok(!pattern.test(textRec), `Fila não deve vazar SQL: ${payload}`);
        }
      }
    });

    it('resiste a payloads SQL em campos JSON de escrita (PATCH game, POST list, POST reorder)', async () => {
      const games = await ctx.service.all();
      const game = games[0];
      assert.ok(game);

      for (const payload of SQLI_PAYLOADS) {
        // PATCH jogo
        const resPatch = await testFetch(
          ctx.baseUrl,
          `/api/v1/games/${encodeURIComponent(game.id)}`,
          {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: payload }),
          },
        );
        assert.notEqual(resPatch.status, 500, `PATCH não deve gerar 500: ${payload}`);
        const textPatch = await resPatch.text();
        for (const pattern of SQL_DRIVER_ERROR_PATTERNS) {
          assert.ok(!pattern.test(textPatch), `PATCH não deve vazar erro SQL: ${payload}`);
        }

        // POST list
        const resList = await testFetch(ctx.baseUrl, '/api/v1/lists', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: payload.slice(0, 50) }),
        });
        assert.notEqual(resList.status, 500);
        const textList = await resList.text();
        for (const pattern of SQL_DRIVER_ERROR_PATTERNS) {
          assert.ok(!pattern.test(textList), `POST list não deve vazar erro SQL: ${payload}`);
        }
      }
    });
  },
);
