// Throwaway Postgres for the database tests: `node test-db.mjs up|down|reset`.
// Needs only the docker CLI: SQL runs through `docker exec`, so the host needs no psql.
import { execFileSync, spawnSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const infra = fileURLToPath(new URL('../infra/', import.meta.url));
const migrations = `${infra}supabase/migrations/`;
const COMPOSE = ['compose', '-f', `${infra}docker-compose.test.yml`];
export const CONTAINER = 'checkpoint-test-db';
export const DB_NAME = 'checkpoint_security_vitest'; // the test guard requires this prefix
export const DB_URL = `postgres://postgres:checkpoint-test@127.0.0.1:54329/${DB_NAME}`;
const MARK = 'checkpoint-migrated'; // database comment written after the last migration

const docker = (args, input) =>
  execFileSync('docker', args, { input, encoding: 'utf8', stdio: ['pipe', 'pipe', 'inherit'] });

/** Runs SQL in the container. `db` null connects to the `postgres` maintenance database. */
const psql = (sql, { db = DB_NAME, tx = false } = {}) =>
  docker(
    [
      'exec',
      '-i',
      '-e',
      'PGOPTIONS=-c client_min_messages=warning',
      CONTAINER,
      'psql',
      '-U',
      'postgres',
      '-d',
      db ?? 'postgres',
      '-v',
      'ON_ERROR_STOP=1',
      '-qtA',
      ...(tx ? ['-1'] : []),
    ],
    sql,
  );

export const isHealthy = () => {
  const r = spawnSync('docker', ['inspect', '-f', '{{.State.Health.Status}}', CONTAINER], {
    encoding: 'utf8',
  });
  return r.status === 0 && r.stdout.trim() === 'healthy';
};

export const isMigrated = () => {
  try {
    return (
      psql(
        `SELECT shobj_description(oid, 'pg_database') FROM pg_database WHERE datname = '${DB_NAME}'`,
        { db: null },
      ).trim() === MARK
    );
  } catch {
    return false;
  }
};

// Supabase objects the migrations expect on a plain Postgres: roles, the auth schema, extensions.
const STUBS = `
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN; END IF;
END $$;
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE SCHEMA IF NOT EXISTS auth;
CREATE TABLE IF NOT EXISTS auth.users (id uuid PRIMARY KEY, email text);
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
  AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
`;

// Files with their own BEGIN/COMMIT run as they are; the others run in one transaction.
const apply = (sql) => psql(sql, { tx: !/^\s*begin\s*;/im.test(sql) });

function up() {
  docker([...COMPOSE, 'up', '-d', '--wait']);
  if (isMigrated()) return console.log('already migrated');
  psql(`DROP DATABASE IF EXISTS ${DB_NAME} WITH (FORCE)`, { db: null });
  psql(`CREATE DATABASE ${DB_NAME}`, { db: null });
  psql(STUBS, { tx: true });
  for (const file of readdirSync(migrations)
    .filter((f) => f.endsWith('.sql'))
    .sort()) {
    // The seed rows must exist before this migration; it fails on an empty table.
    if (file.startsWith('20261012134709')) apply(readFileSync(`${infra}db/seed/seed.sql`, 'utf8'));
    apply(readFileSync(migrations + file, 'utf8'));
    console.log('applied', file);
  }
  psql(`COMMENT ON DATABASE ${DB_NAME} IS '${MARK}'`, { db: null });
}

const down = () => docker([...COMPOSE, 'down', '--volumes']);

const commands = { up, down, reset: () => (down(), up()) };
if (import.meta.url === `file://${process.argv[1]}`) {
  const run = commands[process.argv[2]];
  if (!run) {
    console.error('usage: test-db.mjs up|down|reset');
    process.exit(2);
  }
  run();
  if (process.argv[2] !== 'down') console.log(`SECURITY_TEST_DATABASE_URL=${DB_URL}`);
}
