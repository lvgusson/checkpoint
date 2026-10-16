---
name: infrastructure
description: Hosting, storage modes, environment variables and scripts of the API.
type: reference
area: backend
---

# Backend infrastructure

## Layout

| Path                      | Holds                                                                |
| ------------------------- | -------------------------------------------------------------------- |
| `apps/api/src`            | Server, services, repositories, drivers, auth, observability         |
| `apps/api/src/data`       | Ports, repositories, and drivers (Postgres and JSON)                 |
| `apps/api/index.mjs`      | Vercel Function entry; plain JS that loads the `.ts` sources         |
| `apps/api/openapi.json`   | API contract, served at `/api/v1/openapi.json`                       |
| `apps/api/infra/db`       | Plain-Postgres migrations and the seed generator                     |
| `apps/api/infra/supabase` | Supabase CLI project; its `migrations` folder is canonical to deploy |
| `apps/api/infra/data`     | Seed inputs (metadata, wishlist snapshot)                            |
| `apps/api/scripts`        | Release, rollback, metadata and master-user scripts                  |
| `scripts/dev.mjs`         | Starts API and web together for `pnpm dev`                           |

## Storage modes

`createData` in `apps/api/src/main/data.ts` builds the persistence layer.
It replaces the old monolith repositories with the Repository and Drivers pattern.
Repositories in `apps/api/src/data/repositories/` implement domain ports in `apps/api/src/data/ports.ts`.
Repositories resolve ownership for private records and map persistence failures. Shared catalog and release data remain global.
Drivers in `apps/api/src/data/drivers/` handle raw persistence without business logic.
Postgres drivers (`PgGamesDriver`, `PgWishlistDriver`, `PgListsDriver` in `apps/api/src/data/drivers/pg/`) execute SQL queries.
JSON drivers (`JsonGamesDriver` and the other `Json*Driver` classes in `apps/api/src/data/drivers/json/`) read and write local files.

Environment variables select the driver for each entity:

- `GAMES_STORE`: driver for games and wishlist (`pg` or `json`).
- `LISTS_STORE`: driver for lists (`pg` or `json`).
- `PINS_STORE`: driver for manual pins (`pg` or `json`).
- `SCORING_STORE`: driver for scoring settings (`pg` or `json`).
- `APP_USERS_STORE`: driver for user identity mapping (`pg` or `json`).
- `RELEASES_STORE`: `pg` enables the release registry. `json` disables it; no JSON release driver exists.

When `DATABASE_URL` is present, entities default to `pg`.
Otherwise, entities default to `json`.
Private stores must use the same driver. With `SUPABASE_URL`, every private store must use `pg`.
The local server uses `apps/api/data`. The Vercel entry uses `DATA_DIR` or the temporary `checkpoint` directory.
Explicit file variables, such as `DATA_FILE`, override paths in that directory.
Use local JSON storage for development only.

## Metadata configuration storage

The API loads metadata vocabularies through `ConfigRepository`.
`PgConfigDriver` reads vocabulary values directly from existing database tables:

- `genre`: primary genres.
- `tag`: secondary tags.
- `mechanic`: game mechanics.
- `store`: game stores.
- `ref_pace`: gameplay paces.
- `ref_structure`: game structures.
- `ref_platform`: gaming platforms.

`JsonConfigDriver` loads `config.json`. Without that file, it combines `apps/api/src/data/config-seed.ts` with metadata from local games.

## Environment variables

`.env.example` lists the main variables.
Search `process.env` and `env.` in `apps/api` for other variables.
Variable groups include Supabase (`SUPABASE_URL`), database (`DATABASE_URL`), storage drivers (`GAMES_STORE`), logging (`LOG_SINK`), and release tooling.
`API_DEADLINE_MS` (default 15000) sets the request deadline; see "Pooler and deadlines" below.

## Hosting

Vercel builds the web app (`apps/web/dist`) and runs the API as one function through `vercel.json`.
Without `SUPABASE_URL`, production uses an authenticator that returns 503 on protected routes.
System and release routes run before that authenticator. Release registration still requires its separate token and a release store.
The Vercel entry passes no release store, so release endpoints return 503 there.
The local executable permits no-auth mode only on a loopback host outside production.
With `SUPABASE_URL`, JSON private stores prevent startup.

## Release and account commands

Run these commands from the repository root. Root scripts load environment files.
Database release tools prefer `DATABASE_URL_SESSION`, then `DATABASE_URL`. HTTP release registration uses its configured endpoint and token.

| Command                                      | What it does                                                                                                  |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `pnpm release:note -- "text" --kind feature` | Registers a release note. Options: `--name`, `--bump minor\|major`, `--version X.Y.Z`                         |
| `pnpm release:list`                          | Lists registered releases                                                                                     |
| `pnpm release:rollback`                      | Shows the rollback plan. Add `--yes` to run it and register a new release                                     |
| `pnpm release:tag`                           | Tags a registered release in git                                                                              |
| `pnpm master:create`                         | Creates an ordinary account and writes its credentials to `local-env.env`. `--reset` clears only that account |

`vercel-build` runs `apps/api/scripts/record-release.mjs` after the web build to register the deployed commit.

## Pooler and deadlines (lesson from the catalog hang)

- `DATABASE_URL` uses the Supavisor transaction pooler (port 6543). The `postgres` pool has `max: 5`.
- Never fire more queries in parallel than the pool has slots. Seven parallel option queries stalled `GET /api/v1/catalog` and `PATCH /api/v1/games/:id` for 20 s or more on Vercel. The SQL itself ran in under 1 ms.
- Read related rows with ONE statement (`json_build_object`). `PgConfigDriver.list()` does this and caches the result for 10 s. `add` and `remove` clear the cache.
- Every request has a deadline: `withDeadline` in `apps/api/src/shared/request-guard.ts` returns 504 after `API_DEADLINE_MS` (default 15000). It sits inside `createRequestGuard`, so a hung route frees its guard slot.
- Do not rely on `statement_timeout` here. A session-level `SET` does not work in transaction mode (Supabase "Timeouts" guide), and a stalled client read is not a slow statement.
- Proven: the catalog SQL is fast and the old code issued 7 parallel statements with no deadline. Inferred: the exact Supavisor stall mechanism.

## Related

- [[AI/backend/backend]]: Request flow of apps/api and the map of backend notes.
- [[AI/backend/authorization]]: Authentication, permission and ownership rules of the API.
- [[AI/backend/database-checklist]]: Steps to create a database table with indexes, audit columns, and access controls.
- [[AI/backend/security]]: API security boundaries and isolated security tests.
