import { test } from 'node:test';
import assert from 'node:assert/strict';
import { db, closeDb } from '../src/data/db.ts';
import {
  DatabaseSink,
  extractFunctionName,
  formatDatabaseLogRow,
} from '../src/observability/sinks.ts';
import { log, flushLogs, getSink, setSink } from '../src/observability/logger.ts';
import type { LogEvent } from '../../../packages/core/src/observability.ts';

test('extractFunctionName extracts function name from V8 stack trace', () => {
  const stack = `Error: Something failed
    at gamesRoute (/app/apps/api/src/routes/games.ts:42:15)
    at dispatch (/app/apps/api/src/main/server.ts:157:12)`;
  assert.equal(extractFunctionName(stack), 'gamesRoute');

  const asyncStack = `Error: Something failed
    at async findGame (/app/apps/api/src/services/games.ts:10:5)`;
  assert.equal(extractFunctionName(asyncStack), 'findGame');

  const anonStack = `Error: Something failed
    at /app/apps/api/src/main/server.ts:10:5`;
  assert.equal(extractFunctionName(anonStack), 'anonymous');

  assert.equal(extractFunctionName(null), null);
  assert.equal(extractFunctionName(''), null);
});

test('formatDatabaseLogRow maps LogEvent fields to database columns', () => {
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
  assert.equal(row.level, 'error');
  assert.equal(row.event, 'http.unhandled_error');
  assert.equal(row.function_name, 'queryDb');
  assert.equal(row.message, 'Database connection failed');
  assert.equal(row.request_id, 'req-456');
  assert.equal(row.user_id, 'user-789');
  assert.deepEqual(row.payload, { query: 'SELECT 1' });
});

test('DatabaseSink ignores non-error log events', async () => {
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

test('DatabaseSink catches errors and does not throw if database fails', async () => {
  const brokenSink = new DatabaseSink('postgres://invalid:invalid@127.0.0.1:9999/invalid');
  const errorEvent: LogEvent = {
    time: new Date().toISOString(),
    level: 'error',
    event: 'http.unhandled_error',
    fields: { message: 'Failsafe test' },
  };
  await assert.doesNotReject(async () => {
    await brokenSink.write(errorEvent);
    await brokenSink.flush();
  });
  await closeDb();
});

test('DatabaseSink persists error log into Supabase public.logs table', async () => {
  const url = process.env.DATABASE_URL;
  if (!url) return;

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

  assert.equal(rows.length, 1);
  const row = rows[0];
  assert.equal(row.level, 'error');
  assert.equal(row.event, 'http.unhandled_error');
  assert.equal(row.function_name, 'testEndpoint');
  assert.equal(row.message, 'Simulated server error');
  assert.equal(row.request_id, testRequestId);
  assert.equal(row.user_id, 'test-user-id');
  assert.deepEqual(row.payload, { path: '/api/v1/test', method: 'POST' });

  // Clean up test row
  await sql`DELETE FROM public.logs WHERE id = ${row.id}`;
  await closeDb();
});

test('log.error persists unhandled error via logger facade with context', async () => {
  const url = process.env.DATABASE_URL;
  if (!url) return;

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

    assert.equal(rows.length, 1);
    const row = rows[0];
    assert.equal(row.level, 'error');
    assert.equal(row.event, 'http.unhandled_error');
    assert.equal(row.message, 'Logger unhandled exception');
    assert.equal(row.request_id, testRequestId);
    assert.equal(row.user_id, testUserId);
    assert.ok(row.stack);
    assert.deepEqual(row.payload, { extra: 'data' });

    await sql`DELETE FROM public.logs WHERE id = ${row.id}`;
  } finally {
    setSink(originalSink);
    await closeDb();
  }
});
