// Testes de segurança: controle de acesso e IDOR entre múltiplos usuários (User A vs User B).
// Asserta o comportamento SEGURO: User B não pode acessar, modificar nem listar recursos de User A (deve receber 404).
import { describe, it, beforeAll, afterAll, expect } from 'vitest';
import { Role } from '../../../../packages/core/src/authorization.ts';
import { startTestServer, testFetch, type TestServerContext } from './helper.ts';

describe.skipIf(!process.env.SECURITY_TEST_DATABASE_URL)(
  'Security: IDOR & Multi-User Ownership Isolation',
  () => {
    let ctx: TestServerContext;
    const userAHeaders = {
      Authorization: 'Bearer token-user-a',
      'Content-Type': 'application/json',
    };
    const userBHeaders = {
      Authorization: 'Bearer token-user-b',
      'Content-Type': 'application/json',
    };

    beforeAll(async () => {
      ctx = await startTestServer({
        initialUsers: {
          'token-user-a': { id: '00000000-0000-4000-a000-000000000001', role: Role.User },
          'token-user-b': { id: '00000000-0000-4000-b000-000000000002', role: Role.User },
        },
      });
    });

    afterAll(async () => {
      await ctx?.close();
    });

    it('exige autenticação em rotas protegidas quando auth está ativo (401)', async () => {
      const res = await testFetch(ctx.baseUrl, '/api/v1/lists');
      expect(res.status, 'Requisição sem token deve retornar 401').toBe(401);

      const resBad = await testFetch(ctx.baseUrl, '/api/v1/lists', {
        headers: { Authorization: 'Bearer token-invalido' },
      });
      expect(resBad.status, 'Requisição com token desconhecido deve retornar 401').toBe(401);
    });

    it('User B deve receber 404 ao tentar acessar ou excluir lista criada por User A', async () => {
      // User A cria uma lista
      const createRes = await testFetch(ctx.baseUrl, '/api/v1/lists', {
        method: 'POST',
        headers: userAHeaders,
        body: JSON.stringify({ name: 'Lista Secreta do User A' }),
      });
      expect(createRes.status, 'User A deve conseguir criar sua lista').toBe(201);
      const listA = await createRes.json();
      expect(listA.id, 'Lista criada deve conter ID').toBeTruthy();

      // User B tenta renomear a lista de User A -> deve responder 404 (não revelar existência)
      const patchRes = await testFetch(ctx.baseUrl, `/api/v1/lists/${listA.id}`, {
        method: 'PATCH',
        headers: userBHeaders,
        body: JSON.stringify({ name: 'Hacked List' }),
      });
      expect(
        patchRes.status,
        `User B não deve conseguir alterar a lista de User A (esperado 404, recebido ${patchRes.status})`,
      ).toBe(404);

      // User B tenta apagar a lista de User A -> deve responder 404
      const deleteRes = await testFetch(ctx.baseUrl, `/api/v1/lists/${listA.id}`, {
        method: 'DELETE',
        headers: userBHeaders,
      });
      expect(
        deleteRes.status,
        `User B não deve conseguir apagar a lista de User A (esperado 404, recebido ${deleteRes.status})`,
      ).toBe(404);
    });

    it('User B deve receber 404 ao acessar recomendações/fila de lista de User A', async () => {
      const createRes = await testFetch(ctx.baseUrl, '/api/v1/lists', {
        method: 'POST',
        headers: userAHeaders,
        body: JSON.stringify({ name: 'Fila Privada User A' }),
      });
      const listA = await createRes.json();

      const recRes = await testFetch(ctx.baseUrl, `/api/v1/lists/${listA.id}/recommendations`, {
        headers: userBHeaders,
      });
      expect(
        recRes.status,
        `User B não deve ver a fila da lista de User A (esperado 404, recebido ${recRes.status})`,
      ).toBe(404);
    });

    it('User B deve receber 404 ao acessar ou alterar configurações de pontuação de lista de User A', async () => {
      const createRes = await testFetch(ctx.baseUrl, '/api/v1/lists', {
        method: 'POST',
        headers: userAHeaders,
        body: JSON.stringify({ name: 'Settings List User A' }),
      });
      const listA = await createRes.json();

      // Leitura das configurações
      const getRes = await testFetch(ctx.baseUrl, `/api/v1/lists/${listA.id}/settings/scoring`, {
        headers: userBHeaders,
      });
      expect(
        getRes.status,
        `User B não deve ler settings de User A (esperado 404, recebido ${getRes.status})`,
      ).toBe(404);

      // Reset das configurações
      const resetRes = await testFetch(
        ctx.baseUrl,
        `/api/v1/lists/${listA.id}/settings/scoring/reset`,
        {
          method: 'POST',
          headers: userBHeaders,
        },
      );
      expect(
        resetRes.status,
        `User B não deve resetar settings de User A (esperado 404, recebido ${resetRes.status})`,
      ).toBe(404);
    });

    it('User B não deve ver listas de User A no endpoint GET /api/v1/lists', async () => {
      // Cria lista para User A com nome identificável
      const uniqueName = `Privada_${Date.now()}`;
      await testFetch(ctx.baseUrl, '/api/v1/lists', {
        method: 'POST',
        headers: userAHeaders,
        body: JSON.stringify({ name: uniqueName }),
      });

      // User B lista suas listas
      const listRes = await testFetch(ctx.baseUrl, '/api/v1/lists', {
        headers: userBHeaders,
      });
      expect(listRes.status).toBe(200);
      const userBLists: { name: string }[] = await listRes.json();
      const leaked = userBLists.some((l) => l.name === uniqueName);
      expect(leaked, 'GET /api/v1/lists de User B não deve conter listas criadas por User A').toBe(
        false,
      );
    });
    it('hides foreign games, edits, prerequisites, and queue pins', async () => {
      const create = async (headers: Record<string, string>, name: string) => {
        const response = await testFetch(ctx.baseUrl, '/api/v1/wishlist', {
          method: 'POST',
          headers,
          body: JSON.stringify({ name, notes: 'private notes' }),
        });
        expect(response.status).toBe(201);
        const data = await response.json();
        return data.game ?? data;
      };
      const a = await create(userAHeaders, 'Private game A');
      const b = await create(userBHeaders, 'Private game B');
      const foreign = `/api/v1/games/${encodeURIComponent(a.id)}`;
      expect((await testFetch(ctx.baseUrl, foreign, { headers: userBHeaders })).status).toBe(404);
      expect(
        (
          await testFetch(ctx.baseUrl, foreign, {
            method: 'PATCH',
            headers: userBHeaders,
            body: JSON.stringify({ notes: 'stolen' }),
          })
        ).status,
      ).toBe(404);
      expect(
        (
          await testFetch(ctx.baseUrl, `/api/v1/games/${encodeURIComponent(b.id)}`, {
            method: 'PATCH',
            headers: userBHeaders,
            body: JSON.stringify({ prerequisiteId: a.id }),
          })
        ).status,
      ).toBe(404);
      expect(
        (
          await testFetch(ctx.baseUrl, '/api/v1/queue/reorder', {
            method: 'POST',
            headers: userBHeaders,
            body: JSON.stringify({ gameId: a.id, toPosition: 1 }),
          })
        ).status,
      ).toBe(404);
      const own = await testFetch(ctx.baseUrl, foreign, { headers: userAHeaders });
      expect(own.status).toBe(200);
      expect((await own.json()).notes).toBe('private notes');
      const search = await testFetch(ctx.baseUrl, '/api/v1/games/search?q=Private%20game%20A', {
        headers: userBHeaders,
      });
      expect(search.status).toBe(200);
      expect(await search.json()).toEqual([]);
    });
  },
);
