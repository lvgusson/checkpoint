// Testes de segurança: controle de acesso e IDOR entre múltiplos usuários (User A vs User B).
// Asserta o comportamento SEGURO: User B não pode acessar, modificar nem listar recursos de User A (deve receber 404).
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { Role } from '../../../../packages/core/src/authorization.ts';
import { startTestServer, testFetch, type TestServerContext } from './helper.ts';

describe(
  'Security: IDOR & Multi-User Ownership Isolation',
  {
    skip:
      !process.env.SECURITY_TEST_DATABASE_URL && 'Requires an isolated SECURITY_TEST_DATABASE_URL',
  },
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

    before(async () => {
      ctx = await startTestServer({
        initialUsers: {
          'token-user-a': { id: '00000000-0000-4000-a000-000000000001', role: Role.User },
          'token-user-b': { id: '00000000-0000-4000-b000-000000000002', role: Role.User },
        },
      });
    });

    after(async () => {
      await ctx?.close();
    });

    it('exige autenticação em rotas protegidas quando auth está ativo (401)', async () => {
      const res = await testFetch(ctx.baseUrl, '/api/v1/lists');
      assert.equal(res.status, 401, 'Requisição sem token deve retornar 401');

      const resBad = await testFetch(ctx.baseUrl, '/api/v1/lists', {
        headers: { Authorization: 'Bearer token-invalido' },
      });
      assert.equal(resBad.status, 401, 'Requisição com token desconhecido deve retornar 401');
    });

    it('User B deve receber 404 ao tentar acessar ou excluir lista criada por User A', async () => {
      // User A cria uma lista
      const createRes = await testFetch(ctx.baseUrl, '/api/v1/lists', {
        method: 'POST',
        headers: userAHeaders,
        body: JSON.stringify({ name: 'Lista Secreta do User A' }),
      });
      assert.equal(createRes.status, 201, 'User A deve conseguir criar sua lista');
      const listA = await createRes.json();
      assert.ok(listA.id, 'Lista criada deve conter ID');

      // User B tenta renomear a lista de User A -> deve responder 404 (não revelar existência)
      const patchRes = await testFetch(ctx.baseUrl, `/api/v1/lists/${listA.id}`, {
        method: 'PATCH',
        headers: userBHeaders,
        body: JSON.stringify({ name: 'Hacked List' }),
      });
      assert.equal(
        patchRes.status,
        404,
        `User B não deve conseguir alterar a lista de User A (esperado 404, recebido ${patchRes.status})`,
      );

      // User B tenta apagar a lista de User A -> deve responder 404
      const deleteRes = await testFetch(ctx.baseUrl, `/api/v1/lists/${listA.id}`, {
        method: 'DELETE',
        headers: userBHeaders,
      });
      assert.equal(
        deleteRes.status,
        404,
        `User B não deve conseguir apagar a lista de User A (esperado 404, recebido ${deleteRes.status})`,
      );
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
      assert.equal(
        recRes.status,
        404,
        `User B não deve ver a fila da lista de User A (esperado 404, recebido ${recRes.status})`,
      );
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
      assert.equal(
        getRes.status,
        404,
        `User B não deve ler settings de User A (esperado 404, recebido ${getRes.status})`,
      );

      // Reset das configurações
      const resetRes = await testFetch(
        ctx.baseUrl,
        `/api/v1/lists/${listA.id}/settings/scoring/reset`,
        {
          method: 'POST',
          headers: userBHeaders,
        },
      );
      assert.equal(
        resetRes.status,
        404,
        `User B não deve resetar settings de User A (esperado 404, recebido ${resetRes.status})`,
      );
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
      assert.equal(listRes.status, 200);
      const userBLists: { name: string }[] = await listRes.json();
      const leaked = userBLists.some((l) => l.name === uniqueName);
      assert.equal(
        leaked,
        false,
        'GET /api/v1/lists de User B não deve conter listas criadas por User A',
      );
    });
    it('hides foreign games, edits, prerequisites, and queue pins', async () => {
      const create = async (headers: Record<string, string>, name: string) => {
        const response = await testFetch(ctx.baseUrl, '/api/v1/wishlist', {
          method: 'POST',
          headers,
          body: JSON.stringify({ name, notes: 'private notes' }),
        });
        assert.equal(response.status, 201);
        const data = await response.json();
        return data.game ?? data;
      };
      const a = await create(userAHeaders, 'Private game A');
      const b = await create(userBHeaders, 'Private game B');
      const foreign = `/api/v1/games/${encodeURIComponent(a.id)}`;
      assert.equal((await testFetch(ctx.baseUrl, foreign, { headers: userBHeaders })).status, 404);
      assert.equal(
        (
          await testFetch(ctx.baseUrl, foreign, {
            method: 'PATCH',
            headers: userBHeaders,
            body: JSON.stringify({ notes: 'stolen' }),
          })
        ).status,
        404,
      );
      assert.equal(
        (
          await testFetch(ctx.baseUrl, `/api/v1/games/${encodeURIComponent(b.id)}`, {
            method: 'PATCH',
            headers: userBHeaders,
            body: JSON.stringify({ prerequisiteId: a.id }),
          })
        ).status,
        404,
      );
      assert.equal(
        (
          await testFetch(ctx.baseUrl, '/api/v1/queue/reorder', {
            method: 'POST',
            headers: userBHeaders,
            body: JSON.stringify({ gameId: a.id, toPosition: 1 }),
          })
        ).status,
        404,
      );
      const own = await testFetch(ctx.baseUrl, foreign, { headers: userAHeaders });
      assert.equal(own.status, 200);
      assert.equal((await own.json()).notes, 'private notes');
      const search = await testFetch(ctx.baseUrl, '/api/v1/games/search?q=Private%20game%20A', {
        headers: userBHeaders,
      });
      assert.equal(search.status, 200);
      assert.deepEqual(await search.json(), []);
    });
  },
);
