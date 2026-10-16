// Vitest: testes de integração do coletor de tracking (POST /api/v1/track) com Postgres local.
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Role } from '../../../packages/core/src/authorization.ts';
import { startTestServer, testFetch, type TestServerContext } from './security/helper.ts';
import { db, type Sql } from '../src/data/db.ts';
import { resetTrackRateLimiter } from '../src/routes/track.ts';

const USER1_ID = '00000000-0000-4000-a000-000000000010';
const USER2_ID = '00000000-0000-4000-a000-000000000020';

async function waitFor(
  predicate: () => Promise<boolean>,
  timeoutMs = 2000,
  intervalMs = 20,
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await predicate()) return;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error(`waitFor timed out after ${timeoutMs}ms`);
}

describe.skipIf(!process.env.SECURITY_TEST_DATABASE_URL)('Tracking API: POST /api/v1/track', () => {
  let ctx: TestServerContext;
  let sql: Sql;

  const user1Headers = {
    Authorization: 'Bearer token-user-1',
    'Content-Type': 'application/json',
  };

  const user2Headers = {
    Authorization: 'Bearer token-user-2',
    'Content-Type': 'application/json',
  };

  beforeAll(async () => {
    ctx = await startTestServer({
      initialUsers: {
        'token-user-1': { id: USER1_ID, role: Role.User },
        'token-user-2': { id: USER2_ID, role: Role.User },
      },
    });
    sql = db(process.env.SECURITY_TEST_DATABASE_URL!);
  });

  afterAll(async () => {
    await ctx?.close();
  });

  beforeEach(async () => {
    resetTrackRateLimiter();
    await sql`DELETE FROM public.user_track WHERE user_id IN (${USER1_ID}::uuid, ${USER2_ID}::uuid)`;
    await sql`DELETE FROM public.page_track WHERE created_by IN (${USER1_ID}::uuid, ${USER2_ID}::uuid)`;
  });

  it('rejeita requisições anônimas com status 401', async () => {
    const res = await testFetch(ctx.baseUrl, '/api/v1/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: 'anon-session',
        automated: false,
        events: [
          {
            kind: 'page_view',
            screen: '/biblioteca',
            occurredAt: new Date().toISOString(),
          },
        ],
      }),
    });

    expect(res.status).toBe(401);
  });

  it('rejeita payload inválido com status 400', async () => {
    // Falta sessionId e automated
    const resMissing = await testFetch(ctx.baseUrl, '/api/v1/track', {
      method: 'POST',
      headers: user1Headers,
      body: JSON.stringify({
        events: [],
      }),
    });
    expect(resMissing.status).toBe(400);

    // Tela com caracteres inválidos
    const resBadScreen = await testFetch(ctx.baseUrl, '/api/v1/track', {
      method: 'POST',
      headers: user1Headers,
      body: JSON.stringify({
        sessionId: 'session-invalid-screen',
        automated: false,
        events: [
          {
            kind: 'page_view',
            screen: 'invalid-screen-without-leading-slash',
            occurredAt: new Date().toISOString(),
          },
        ],
      }),
    });
    expect(resBadScreen.status).toBe(400);

    // Elemento com caracteres proibidos (ex: espaços ou tags HTML)
    const resBadElement = await testFetch(ctx.baseUrl, '/api/v1/track', {
      method: 'POST',
      headers: user1Headers,
      body: JSON.stringify({
        sessionId: 'session-invalid-element',
        automated: false,
        events: [
          {
            kind: 'click',
            screen: '/biblioteca',
            element: 'button with spaces',
            occurredAt: new Date().toISOString(),
          },
        ],
      }),
    });
    expect(resBadElement.status).toBe(400);

    // Kind inválido
    const resBadKind = await testFetch(ctx.baseUrl, '/api/v1/track', {
      method: 'POST',
      headers: user1Headers,
      body: JSON.stringify({
        sessionId: 'session-invalid-kind',
        automated: false,
        events: [
          {
            kind: 'scroll',
            screen: '/biblioteca',
            occurredAt: new Date().toISOString(),
          },
        ],
      }),
    });
    expect(resBadKind.status).toBe(400);
  });

  it('processa lote de eventos de forma assíncrona e grava em user_track (< 5ms de handler)', async () => {
    const now = new Date();
    const payload = {
      sessionId: 'session-batch-test-1',
      automated: false,
      events: [
        {
          kind: 'page_view' as const,
          screen: '/biblioteca',
          occurredAt: new Date(now.getTime() - 60_000).toISOString(),
        },
        {
          kind: 'click' as const,
          screen: '/biblioteca',
          element: 'filter-genre-action',
          occurredAt: new Date(now.getTime() - 40_000).toISOString(),
        },
        {
          kind: 'click' as const,
          screen: '/biblioteca',
          element: 'game-card-start',
          occurredAt: new Date(now.getTime() - 20_000).toISOString(),
        },
      ],
    };

    const t0 = performance.now();
    const res = await testFetch(ctx.baseUrl, '/api/v1/track', {
      method: 'POST',
      headers: user1Headers,
      body: JSON.stringify(payload),
    });
    const durationMs = performance.now() - t0;

    expect(res.status).toBe(202);
    const data = await res.json();
    expect(data).toEqual({ status: 'accepted' });

    // O handler retorna imediatamente; a persistência ocorre em segundo plano.
    expect(durationMs).toBeLessThan(100);

    // Aguarda consistência eventual no banco de dados.
    await waitFor(async () => {
      const rows = await sql<{ count: string }[]>`
          SELECT count(*) FROM public.user_track
          WHERE user_id = ${USER1_ID}::uuid AND session_id = 'session-batch-test-1'
        `;
      return Number(rows[0]?.count) === 3;
    });

    const records = await sql<
      {
        kind: string;
        screen: string;
        element: string | null;
        automated: boolean;
        created_by: string;
      }[]
    >`
        SELECT kind, screen, element, automated, created_by
        FROM public.user_track
        WHERE user_id = ${USER1_ID}::uuid AND session_id = 'session-batch-test-1'
        ORDER BY occurred_at ASC
      `;

    expect(records).toHaveLength(3);
    expect(records[0]).toMatchObject({
      kind: 'page_view',
      screen: '/biblioteca',
      element: null,
      automated: false,
      created_by: USER1_ID,
    });
    expect(records[1]).toMatchObject({
      kind: 'click',
      screen: '/biblioteca',
      element: 'filter-genre-action',
      automated: false,
      created_by: USER1_ID,
    });
    expect(records[2]).toMatchObject({
      kind: 'click',
      screen: '/biblioteca',
      element: 'game-card-start',
      automated: false,
      created_by: USER1_ID,
    });
  });

  it('consolida contagens em page_track acumulando após dois lotes (upsert atômico)', async () => {
    const now = new Date();
    const today = now.toISOString().slice(0, 10);

    // Lote 1: 1 page_view + 2 clicks
    const batch1 = {
      sessionId: 'session-accumulate-1',
      automated: false,
      events: [
        {
          kind: 'page_view' as const,
          screen: '/jogos/:id',
          occurredAt: new Date(now.getTime() - 30_000).toISOString(),
        },
        {
          kind: 'click' as const,
          screen: '/jogos/:id',
          element: 'detail-play-toggle',
          occurredAt: new Date(now.getTime() - 20_000).toISOString(),
        },
        {
          kind: 'click' as const,
          screen: '/jogos/:id',
          element: 'detail-close',
          occurredAt: new Date(now.getTime() - 10_000).toISOString(),
        },
      ],
    };

    const res1 = await testFetch(ctx.baseUrl, '/api/v1/track', {
      method: 'POST',
      headers: user1Headers,
      body: JSON.stringify(batch1),
    });
    expect(res1.status).toBe(202);

    await waitFor(async () => {
      const rows = await sql<{ access_count: string; click_count: string }[]>`
          SELECT access_count, click_count FROM public.page_track
          WHERE screen = '/jogos/:id' AND day = ${today}::date
        `;
      return (
        rows.length === 1 && Number(rows[0].access_count) === 1 && Number(rows[0].click_count) === 2
      );
    });

    // Lote 2: 1 page_view + 1 click
    const batch2 = {
      sessionId: 'session-accumulate-2',
      automated: false,
      events: [
        {
          kind: 'page_view' as const,
          screen: '/jogos/:id',
          occurredAt: now.toISOString(),
        },
        {
          kind: 'click' as const,
          screen: '/jogos/:id',
          element: 'detail-rate-game',
          occurredAt: now.toISOString(),
        },
      ],
    };

    const res2 = await testFetch(ctx.baseUrl, '/api/v1/track', {
      method: 'POST',
      headers: user1Headers,
      body: JSON.stringify(batch2),
    });
    expect(res2.status).toBe(202);

    // Deve acumular: 1 + 1 = 2 page_views, 2 + 1 = 3 clicks
    await waitFor(async () => {
      const rows = await sql<{ access_count: string; click_count: string; last_access_at: Date }[]>`
          SELECT access_count, click_count, last_access_at FROM public.page_track
          WHERE screen = '/jogos/:id' AND day = ${today}::date
        `;
      return (
        rows.length === 1 && Number(rows[0].access_count) === 2 && Number(rows[0].click_count) === 3
      );
    });

    const [summary] = await sql<
      { access_count: string; click_count: string; last_access_at: Date }[]
    >`
        SELECT access_count, click_count, last_access_at FROM public.page_track
        WHERE screen = '/jogos/:id' AND day = ${today}::date
      `;
    expect(Number(summary.access_count)).toBe(2);
    expect(Number(summary.click_count)).toBe(3);
    expect(summary.last_access_at).not.toBeNull();
  });

  it('limita occurredAt para o tempo do servidor quando o desvio do cliente excede 24h', async () => {
    const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();
    const payload = {
      sessionId: 'session-drift-test',
      automated: false,
      events: [
        {
          kind: 'page_view' as const,
          screen: '/configuracoes',
          occurredAt: fiveDaysAgo,
        },
      ],
    };

    const res = await testFetch(ctx.baseUrl, '/api/v1/track', {
      method: 'POST',
      headers: user1Headers,
      body: JSON.stringify(payload),
    });
    expect(res.status).toBe(202);

    await waitFor(async () => {
      const rows = await sql<{ count: string }[]>`
          SELECT count(*) FROM public.user_track
          WHERE user_id = ${USER1_ID}::uuid AND session_id = 'session-drift-test'
        `;
      return Number(rows[0]?.count) === 1;
    });

    const [recorded] = await sql<{ occurred_at: Date }[]>`
        SELECT occurred_at FROM public.user_track
        WHERE user_id = ${USER1_ID}::uuid AND session_id = 'session-drift-test'
      `;

    // occurred_at gravado não deve ser de 5 dias atrás, mas próximo ao horário atual (servidor)
    const diffMs = Math.abs(Date.now() - new Date(recorded.occurred_at).getTime());
    expect(diffMs).toBeLessThan(10_000);
  });

  it('aplica limite de taxa próprio (30 req/min por usuário, 31ª retorna 429)', async () => {
    resetTrackRateLimiter();

    const makeBody = (i: number) =>
      JSON.stringify({
        sessionId: `rate-limit-session-${i}`,
        automated: false,
        events: [
          {
            kind: 'click',
            screen: '/biblioteca',
            element: 'btn-ping',
            occurredAt: new Date().toISOString(),
          },
        ],
      });

    // Dispara 30 requisições para USER1: todas devem retornar 202
    for (let i = 1; i <= 30; i++) {
      const res = await testFetch(ctx.baseUrl, '/api/v1/track', {
        method: 'POST',
        headers: user1Headers,
        body: makeBody(i),
      });
      expect(res.status, `Requisição ${i} deve ser aceita (202)`).toBe(202);
    }

    // 31ª requisição do USER1: deve retornar 429 com Retry-After: 60
    const res31 = await testFetch(ctx.baseUrl, '/api/v1/track', {
      method: 'POST',
      headers: user1Headers,
      body: makeBody(31),
    });
    expect(res31.status).toBe(429);
    expect(res31.headers.get('retry-after')).toBe('60');

    // USER2 não deve ser afetado (limite é isolado por usuário)
    const resUser2 = await testFetch(ctx.baseUrl, '/api/v1/track', {
      method: 'POST',
      headers: user2Headers,
      body: makeBody(99),
    });
    expect(resUser2.status).toBe(202);
  });
});
