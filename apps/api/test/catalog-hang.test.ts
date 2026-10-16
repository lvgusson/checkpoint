import { afterEach, expect, it } from 'vitest';
import type { AddressInfo } from 'node:net';
import { makeServer } from '../src/main/server.ts';
import { PgConfigDriver } from '../src/data/drivers/pg/config.ts';
import type { GameService } from '../src/services/games.ts';
import type { Sql } from '../src/data/db.ts';

// Production hang: GET /api/v1/catalog never answered (7 parallel queries on a 5-slot pool behind
// the Supavisor transaction pooler, and no deadline on the request path).

const catalogRow = {
  genres: ['RPG'],
  tags: ['Indie'],
  mechanics: ['Loot'],
  stores: ['Steam'],
  paces: ['Calmo'],
  structures: ['Campanha'],
  platforms: ['PC'],
};

/** A fake `sql`: a statement counts as a round trip only when something awaits it. */
function fakeSql() {
  const statements: string[] = [];
  const sql = ((first: unknown) => {
    if (!Array.isArray(first)) return { identifier: first };
    const text = first.join('?');
    return {
      then: (ok: (rows: unknown) => unknown, fail: (e: unknown) => unknown) => {
        statements.push(text);
        return Promise.resolve([{ catalog: catalogRow }]).then(ok, fail);
      },
    };
  }) as unknown as Sql;
  (sql as unknown as { begin: unknown }).begin = async (fn: (tx: unknown) => unknown) => fn(sql);
  return { sql, statements };
}

it('catalog option read costs one database statement', async () => {
  const { sql, statements } = fakeSql();
  const catalog = await new PgConfigDriver(sql).list();
  expect(statements).toHaveLength(1);
  expect(catalog).toStrictEqual(catalogRow);
});

it('catalog option read is cached until an option changes', async () => {
  const { sql, statements } = fakeSql();
  const driver = new PgConfigDriver(sql);
  await driver.list();
  await driver.list();
  expect(statements.filter((s) => s.includes('json_build_object'))).toHaveLength(1);
  await driver.add('genres', 'Puzzle');
  await driver.list();
  expect(statements.filter((s) => s.includes('json_build_object'))).toHaveLength(2);
});

const closers: (() => void)[] = [];
afterEach(() => {
  delete process.env.API_DEADLINE_MS;
  closers.splice(0).forEach((close) => close());
});

it('a request whose work never settles ends with 504 problem+json', async () => {
  process.env.API_DEADLINE_MS = '100';
  const hung = { catalog: () => new Promise(() => {}) } as unknown as GameService;
  const server = makeServer(hung, null);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  closers.push(() => server.closeAllConnections());
  closers.push(() => server.close());
  const { port } = server.address() as AddressInfo;
  const started = Date.now();
  const res = await fetch(`http://127.0.0.1:${port}/api/v1/catalog`, {
    signal: AbortSignal.timeout(3000),
  });
  expect(res.status).toBe(504);
  expect(res.headers.get('content-type')).toContain('application/problem+json');
  expect(Date.now() - started).toBeLessThan(2000);
});

const dbUrl = process.env.SECURITY_TEST_DATABASE_URL;
it.skipIf(!dbUrl)('single-statement catalog equals the former per-table queries', async () => {
  const { db, closeDb } = await import('../src/data/db.ts');
  const sql = db(dbUrl);
  try {
    const tables = {
      genres: 'genre',
      tags: 'tag',
      mechanics: 'mechanic',
      stores: 'store',
      paces: 'ref_pace',
      structures: 'ref_structure',
      platforms: 'ref_platform',
    };
    const catalog = await new PgConfigDriver(sql).list();
    for (const [category, table] of Object.entries(tables)) {
      const rows = await sql<{ name: string }[]>`
        SELECT name FROM ${sql(table)} WHERE name <> '' ORDER BY name`;
      expect(catalog[category as keyof typeof catalog]).toStrictEqual(rows.map((r) => r.name));
    }
  } finally {
    await closeDb();
  }
});
