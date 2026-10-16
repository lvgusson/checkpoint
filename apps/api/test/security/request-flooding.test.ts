// Testes de segurança: inundação de requisições (burst flooding), conexões lentas (slow-header/slow-body), rate limiting e latência.
import { describe, it, beforeAll, afterAll, expect } from 'vitest';
import { connect } from 'node:net';
import { startTestServer, testFetch, type TestServerContext } from './helper.ts';

describe('Security: Request Flooding & Rate Limiting', () => {
  let ctx: TestServerContext;

  beforeAll(async () => {
    ctx = await startTestServer();
  });

  afterAll(async () => {
    await ctx.close();
  });

  it('aplica limite de taxa (429) em rotas protegidas por rate-limiter sob rajada de requisições', async () => {
    const TOTAL_REQUESTS = 120;
    const CONCURRENCY = 30;
    const latencies: number[] = [];
    const statusCounts: Record<number, number> = {};

    // Inunda /api/v1/telemetry (limite projetado de 60 requisições por minuto em telemetry-routes.ts)
    const validTelemetryPayload = JSON.stringify({
      events: [
        {
          type: 'metric',
          name: 'client_load_test',
          value: 1,
        },
      ],
    });

    let current = 0;
    const runWorker = async () => {
      while (current < TOTAL_REQUESTS) {
        current++;
        const t0 = performance.now();
        const res = await testFetch(ctx.baseUrl, '/api/v1/telemetry', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: validTelemetryPayload,
        });
        const elapsed = performance.now() - t0;
        latencies.push(elapsed);
        statusCounts[res.status] = (statusCounts[res.status] ?? 0) + 1;
        await res.text();
      }
    };

    const workers = Array.from({ length: CONCURRENCY }, () => runWorker());
    await Promise.all(workers);

    // Estatísticas de latência
    latencies.sort((a, b) => a - b);
    const min = latencies[0];
    const max = latencies[latencies.length - 1];
    const p50 = latencies[Math.floor(latencies.length * 0.5)];
    const p95 = latencies[Math.floor(latencies.length * 0.95)];
    const p99 = latencies[Math.floor(latencies.length * 0.99)];

    // Relata latência
    console.log(
      `[FLOOD TEST LATENCY] min: ${min.toFixed(1)}ms, p50: ${p50.toFixed(1)}ms, p95: ${p95.toFixed(1)}ms, p99: ${p99.toFixed(1)}ms, max: ${max.toFixed(1)}ms`,
    );
    console.log('[FLOOD TEST STATUSES]', statusCounts);

    // As primeiras 60 requisições são aceitas (202), acima disso 429
    expect(
      (statusCounts[429] ?? 0) > 0,
      'O rate limiter deve ter retornado 429 para requisições excedentes',
    ).toBeTruthy();
    expect(
      statusCounts[202],
      'Exatamente 60 requisições devem ter sido aceitas pelo rate limiter',
    ).toBe(60);
  });

  it('responde a health com um cabeçalho incompleto em outra conexão', async () => {
    // Abre socket e envia cabeçalhos incompletos em ritmo lento
    const client = connect({ host: '127.0.0.1', port: ctx.port });

    try {
      await new Promise<void>((resolve) => client.on('connect', resolve));

      // Envia apenas parte dos headers
      client.write('POST /api/v1/lists HTTP/1.1\r\n');
      client.write('Host: 127.0.0.1\r\n');
      client.write('Content-Type: application/json\r\n');
      client.write('Content-Length: 100\r\n');
      // Não fecha os cabeçalhos com \r\n\r\n

      // Enquanto a conexão lenta está aberta, uma requisição normal deve responder imediatamente
      const res = await testFetch(ctx.baseUrl, '/api/v1/health');

      expect(res.status, 'Servidor deve responder normalmente na rota de health').toBe(200);
      await res.text();
    } finally {
      client.destroy();
    }
  });
});
