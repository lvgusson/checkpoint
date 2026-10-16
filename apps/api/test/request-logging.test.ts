// Safe, correlated request logs: an entry log and a completion log share one requestId, and no secret reaches a sink.
import { afterAll, beforeAll, expect, it } from 'vitest';
import { flushLogs, getSink, setSink } from '../src/observability/logger.ts';
import type { LogEvent, LogSink } from '../../../packages/core/src/observability.ts';
import { startTestServer, testFetch, type TestServerContext } from './security/helper.ts';

const events: LogEvent[] = [];
const original = getSink();
const sink: LogSink = { write: (event) => void events.push(event) };
let ctx: TestServerContext;

beforeAll(async () => {
  setSink(sink);
  ctx = await startTestServer();
});

afterAll(async () => {
  await ctx.close();
  await flushLogs();
  setSink(original);
});

it('logs request entry and completion with one requestId and no secret', async () => {
  const requestId = 'req-log-test-0001';
  await testFetch(ctx.baseUrl, '/api/v1/health?access_token=top-secret', {
    headers: { 'x-request-id': requestId, authorization: 'Bearer top-secret' },
  });
  await new Promise((resolve) => setTimeout(resolve, 50));
  const mine = events.filter((e) => e.requestId === requestId);
  const names = mine.map((e) => e.event);
  expect(names).toContain('http.request.entry');
  expect(names).toContain('http.request');
  expect(JSON.stringify(events)).not.toContain('top-secret');
  const entry = mine.find((e) => e.event === 'http.request.entry');
  expect(entry?.fields.path).toBe('/api/v1/health');
});
