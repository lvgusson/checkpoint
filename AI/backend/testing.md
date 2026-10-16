---
name: testing
description: Unit test commands, Vitest configuration, and local database test requirements.
type: reference
area: backend
---

# Backend tests

Vitest runs every unit test. The root pins one Vitest version.
`vitest.config.ts` defines the API project with the Node environment.
The project includes `apps/api/test/**/*.test.ts`. Playwright browser tests use their separate runner.

| Command from repository root                  | Scope                                                                   |
| --------------------------------------------- | ----------------------------------------------------------------------- |
| `pnpm test`                                   | Run all Vitest tests once.                                              |
| `pnpm test:watch`                             | Watch unit tests during development.                                    |
| `pnpm test apps/api/test/timing.test.ts`      | Run one test file.                                                      |
| `pnpm --filter @checkpoint/api test:security` | Run the six HTTP security suites.                                       |
| `pnpm check`                                  | Check types, lint, formatting, tests, and the web build, in that order. |

`pnpm typecheck` checks API source, test files, shared contracts, and the Vitest configuration with strict TypeScript settings.
Tests import `describe`, `it`, `expect`, and `vi` from `vitest` as needed.
New tests use existing public service, route, or storage interfaces.

## Database tests

Result: `pnpm db:up` starts a real Postgres 18 in Docker. `pnpm test` then runs all 73 tests with no skips.

| Command         | What it does                                                                     |
| --------------- | -------------------------------------------------------------------------------- |
| `pnpm db:up`    | Start `checkpoint-test-db`, wait for health, apply Supabase stubs and migrations |
| `pnpm db:down`  | Stop and delete the container and its data                                       |
| `pnpm db:reset` | `db:down`, then `db:up`: a clean database                                        |
| `pnpm test:db`  | `db:up`, then `vitest run`; the container stays up                               |

1. `db:up` is safe to run twice. It marks the database with a comment after the last migration and skips the work when it finds the mark.
2. The container uses `apps/api/infra/docker-compose.test.yml`: image `postgres:18`, port `127.0.0.1:54329` only, data in tmpfs, fixed test password.
3. `apps/api/scripts/test-db.mjs` needs only the docker CLI. It runs SQL through `docker exec`. It creates the roles `anon`, `authenticated`, `service_role`, the `auth` schema with `auth.users`, and the `extensions` schema. Then it applies `apps/api/infra/supabase/migrations` in order. It loads `infra/db/seed/seed.sql` before migration `20261012134709`.
4. A Vitest `globalSetup` (`apps/api/scripts/test-db-global-setup.ts`) prints one line: `db tests: using checkpoint-test-db`, or `db tests: SKIPPED (run pnpm db:up)`. It sets `SECURITY_TEST_DATABASE_URL` only when the container is healthy and migrated.
5. A `SECURITY_TEST_DATABASE_URL` that you set yourself wins over the container.

Without Docker, 61 tests run and 12 skip: the SQL-injection, IDOR and log-persistence tests. The 61 do not need a database.
With a missing URL these tests skip. With a URL set they run. The helper still refuses any host that is not `localhost`, `127.0.0.1` or `[::1]`, and any database whose name does not start with `checkpoint_security_`.
Never use a production database for tests. Do not load application environment files into the test runner.

Disk rule: Docker data lives in `/var/lib/docker`, inside the WSL disk on D:. The test database uses tmpfs, so it writes nothing to disk. Never write large files to `/mnt/c`. Never start Docker Desktop.

## Related

- [[AI/backend/backend]]: Request flow of apps/api and the map of backend notes.
- [[AI/backend/security]]: API security boundaries and isolated security tests.
- [[AI/backend/observability]]: Why logging uses a pluggable sink, and how redaction and safety work.
