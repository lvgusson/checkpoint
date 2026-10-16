import { expect, it } from 'vitest';
import { db, closeDb } from '../src/data/db.ts';
import {
  DatabaseSink,
  extractFunctionName,
  formatDatabaseLogRow,
} from '../src/observability/sinks.ts';
import { log, flushLogs, getSink, setSink } from '../src/observability/logger.ts';
import type { LogEvent } from '../../../packages/core/src/observability.ts';

// Database tests skip without SECURITY_TEST_DATABASE_URL (run `pnpm db:up`); the host guard below stays.
const hasDb = Boolean(process.env.SECURITY_TEST_DATABASE_URL);
const testDatabaseUrl = () => {
  const url = process.env.SECURITY_TEST_DATABASE_URL ?? '';
  const parsed = new URL(url);
  expect(['localhost', '127.0.0.1', '[::1]']).toContain(parsed.hostname);
  expect(parsed.pathname).toMatch(/^\/checkpoint_security_/);
  return url;
};

it('extractFunctionName extracts function name from V8 stack trace', () => {
  const stack = `Error: Something failed
    at gamesRoute (/app/apps/api/src/routes/games.ts:42:15)
    at dispatch (/app/apps/api/src/main/server.ts:157:12)`;
  expect(extractFunctionName(stack)).toBe('gamesRoute');

  const asyncStack = `Error: Something failed
    at async findGame (/app/apps/api/src/services/games.ts:10:5)`;
  expect(extractFunctionName(asyncStack)).toBe('findGame');

  const anonStack = `Error: Something failed
    at /app/apps/api/src/main/server.ts:10:5`;
  expect(extractFunctionName(anonStack)).toBe('anonymous');

  expect(extractFunctionName(null)).toBe(null);
  expect(extractFunctionName('')).toBe(null);
});

it('formatDatabaseLogRow maps LogEvent fields to database columns', () => {
  const event: LogEvent = {
    time: new Date().toISOString(),
    level: 'error',
    event: 'http.unhandled_error',
    requestId: 'req-456',
    userId: 'user-789',
    fields: {
      message: 'Database connection failed',
      stack: 'Error: Database connection failed\n    at queryDb (/app/src/db.ts:1:1)',
      payload: { query: 'SELECT 1' },
    },
  };

  const row = formatDatabaseLogRow(event);
  expect(row.level).toBe('error');
  expect(row.event).toBe('http.unhandled_error');
  expect(row.function_name).toBe('queryDb');
  expect(row.message).toBe('Database connection failed');
  expect(row.request_id).toBe('req-456');
  expect(row.user_id).toBe('user-789');
  expect(row.payload).toStrictEqual({ query: 'SELECT 1' });
});

it('DatabaseSink ignores non-error log events', async () => {
  const sink = new DatabaseSink();
  const infoEvent: LogEvent = {
    time: new Date().toISOString(),
    level: 'info',
    event: 'http.request',
    fields: {},
  };
  await sink.write(infoEvent);
  await sink.flush();
});

it('DatabaseSink catches errors and does not throw if database fails', async () => {
  const brokenSink = new DatabaseSink('postgres://invalid:invalid@127.0.0.1:9999/invalid');
  const errorEvent: LogEvent = {
    time: new Date().toISOString(),
    level: 'error',
    event: 'http.unhandled_error',
    fields: { message: 'Failsafe test' },
  };
  await expect(
    (async () => {
      await brokenSink.write(errorEvent);
      await brokenSink.flush();
    })(),
  ).resolves.toBeUndefined();
  await closeDb();
});

it.skipIf(!hasDb)('DatabaseSink persists error log into Supabase public.logs table', async () => {
  const url = testDatabaseUrl();

  const testRequestId = `test-req-${Date.now()}`;
  const sink = new DatabaseSink(url);

  const errorEvent: LogEvent = {
    time: new Date().toISOString(),
    level: 'error',
    event: 'http.unhandled_error',
    requestId: testRequestId,
    userId: 'test-user-id',
    fields: {
      function_name: 'testEndpoint',
      message: 'Simulated server error',
      stack: 'Error: Simulated server error\n    at testEndpoint (/app/test.ts:1:1)',
      payload: { path: '/api/v1/test', method: 'POST' },
    },
  };

  await sink.write(errorEvent);
  await sink.flush();

  const sql = db(url);
  const rows = await sql`
    SELECT * FROM public.logs WHERE request_id = ${testRequestId}
  `;

  expect(rows.length).toBe(1);
  const row = rows[0];
  expect(row.level).toBe('error');
  expect(row.event).toBe('http.unhandled_error');
  expect(row.function_name).toBe('testEndpoint');
  expect(row.message).toBe('Simulated server error');
  expect(row.request_id).toBe(testRequestId);
  expect(row.user_id).toBe('test-user-id');
  expect(row.payload).toStrictEqual({ path: '/api/v1/test', method: 'POST' });

  // Clean up test row
  await sql`DELETE FROM public.logs WHERE id = ${row.id}`;
  await closeDb();
});

it.skipIf(!hasDb)('log.error persists unhandled error via logger facade with context', async () => {
  const url = testDatabaseUrl();

  const testRequestId = `test-logger-${Date.now()}`;
  const testUserId = `user-${Date.now()}`;

  // Ensure DatabaseSink is active
  const originalSink = getSink();
  setSink(new DatabaseSink(url));

  try {
    const err = new Error('Logger unhandled exception');
    log.error('http.unhandled_error', {
      requestId: testRequestId,
      userId: testUserId,
      error: err,
      payload: { extra: 'data' },
    });
    await flushLogs();

    const sql = db(url);
    const rows = await sql`
      SELECT * FROM public.logs WHERE request_id = ${testRequestId}
    `;

    expect(rows.length).toBe(1);
    const row = rows[0];
    expect(row.level).toBe('error');
    expect(row.event).toBe('http.unhandled_error');
    expect(row.message).toBe('Logger unhandled exception');
    expect(row.request_id).toBe(testRequestId);
    expect(row.user_id).toBe(testUserId);
    expect(row.stack).toBeTruthy();
    expect(row.payload).toStrictEqual({ extra: 'data' });

    await sql`DELETE FROM public.logs WHERE id = ${row.id}`;
  } finally {
    setSink(originalSink);
    await closeDb();
  }
});
