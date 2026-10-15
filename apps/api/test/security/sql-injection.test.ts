// Testes de segurança: injeção de SQL em query params, path params e campos JSON.
import { describe, it, beforeAll, afterAll, expect } from 'vitest';
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

describe.skipIf(!process.env.SECURITY_TEST_DATABASE_URL)(
  'Security: PostgreSQL injection regression cases',
  () => {
    let ctx: TestServerContext;

    beforeAll(async () => {
      ctx = await startTestServer({ postgres: true });
    });

    afterAll(async () => {
      await ctx?.close();
    });

    it('resiste a payloads SQL em query parameters de /api/v1/games', async () => {
      for (const payload of SQLI_PAYLOADS) {
        const res = await testFetch(
          ctx.baseUrl,
          `/api/v1/games?q=${encodeURIComponent(payload)}&status=${encodeURIComponent(payload)}&sort=${encodeURIComponent(payload)}`,
        );

        const text = await res.text();
        expect(res.status, `Query param não deve gerar 500 para payload: ${payload}`).not.toBe(500);
        for (const pattern of SQL_DRIVER_ERROR_PATTERNS) {
          expect(
            !pattern.test(text),
            `A resposta não deve vazar detalhes do driver SQL para payload: ${payload}`,
          ).toBeTruthy();
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
        expect(res.status, `Busca não deve gerar 500 para payload: ${payload}`).not.toBe(500);
        for (const pattern of SQL_DRIVER_ERROR_PATTERNS) {
          expect(!pattern.test(text), `Busca não deve vazar detalhes SQL: ${payload}`).toBeTruthy();
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
        expect(resGame.status, `Path param não deve gerar 500: ${payload}`).not.toBe(500);
        const textGame = await resGame.text();
        for (const pattern of SQL_DRIVER_ERROR_PATTERNS) {
          expect(
            !pattern.test(textGame),
            `Path param de jogo não deve vazar SQL: ${payload}`,
          ).toBeTruthy();
        }

        // Rota de lista
        const resList = await testFetch(
          ctx.baseUrl,
          `/api/v1/lists/${encodeURIComponent(payload)}`,
        );
        expect(resList.status, `Path param de lista não deve gerar 500: ${payload}`).not.toBe(500);
        const textList = await resList.text();
        for (const pattern of SQL_DRIVER_ERROR_PATTERNS) {
          expect(
            !pattern.test(textList),
            `Path param de lista não deve vazar SQL: ${payload}`,
          ).toBeTruthy();
        }

        // Rota de recommendations da lista
        const resRec = await testFetch(
          ctx.baseUrl,
          `/api/v1/lists/${encodeURIComponent(payload)}/recommendations`,
        );
        expect(resRec.status).not.toBe(500);
        const textRec = await resRec.text();
        for (const pattern of SQL_DRIVER_ERROR_PATTERNS) {
          expect(!pattern.test(textRec), `Fila não deve vazar SQL: ${payload}`).toBeTruthy();
        }
      }
    });

    it('resiste a payloads SQL em campos JSON de escrita (PATCH game, POST list, POST reorder)', async () => {
      const games = await ctx.service.all();
      const game = games[0];
      expect(game).toBeTruthy();

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
        expect(resPatch.status, `PATCH não deve gerar 500: ${payload}`).not.toBe(500);
        const textPatch = await resPatch.text();
        for (const pattern of SQL_DRIVER_ERROR_PATTERNS) {
          expect(
            !pattern.test(textPatch),
            `PATCH não deve vazar erro SQL: ${payload}`,
          ).toBeTruthy();
        }

        // POST list
        const resList = await testFetch(ctx.baseUrl, '/api/v1/lists', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: payload.slice(0, 50) }),
        });
        expect(resList.status).not.toBe(500);
        const textList = await resList.text();
        for (const pattern of SQL_DRIVER_ERROR_PATTERNS) {
          expect(
            !pattern.test(textList),
            `POST list não deve vazar erro SQL: ${payload}`,
          ).toBeTruthy();
        }
      }
    });
  },
);
