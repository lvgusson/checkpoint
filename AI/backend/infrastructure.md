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
Each repository enforces tenant isolation and business constraints.
Drivers in `apps/api/src/data/drivers/` handle raw persistence without business logic.
Postgres drivers (`PgGamesDriver`, `PgWishlistDriver`, `PgListsDriver` in `apps/api/src/data/drivers/pg/`) execute SQL queries.
JSON drivers (`JsonGamesDriver` and the other `Json*Driver` classes in `apps/api/src/data/drivers/json/`) read and write local files.

Environment variables select the driver for each entity:

- `GAMES_STORE`: driver for games and wishlist (`pg` or `json`).
- `LISTS_STORE`: driver for lists (`pg` or `json`).
- `PINS_STORE`: driver for manual pins (`pg` or `json`).
- `SCORING_STORE`: driver for scoring settings (`pg` or `json`).
- `APP_USERS_STORE`: driver for user identity mapping (`pg` or `json`).
- `RELEASES_STORE`: driver for release registry (`pg` or `json`).

When `DATABASE_URL` is present, entities default to `pg`.
Otherwise, entities default to `json`.
Local JSON files reside in `DATA_DIR` (defaults to temporary directory `checkpoint`).
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

`JsonConfigDriver` loads metadata from `config.json` or falls back to `apps/api/src/data/config-seed.ts`.

## Environment variables

`.env.example` lists the main variables.
Search `process.env` and `env.` in `apps/api` for other variables.
Variable groups include Supabase (`SUPABASE_URL`), database (`DATABASE_URL`), storage drivers (`GAMES_STORE`), logging (`LOG_SINK`), and release tooling.

## Hosting

Vercel builds the web app (`apps/web/dist`) and runs the API as one function through `vercel.json`.
Without authentication configured, `apps/api/src/main/server.ts` refuses to start. On Vercel, `index.mjs` starts and `authenticatorFromEnv` returns a 503 authenticator: every `/api/*` route except system and release answers 503.
No-auth mode exists only on a loopback host outside production.

## Release and account commands

Run them from the repository root. They read `.env` and need `DATABASE_URL`.

| Command                                      | What it does                                                                                                  |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `pnpm release:note -- "text" --kind feature` | Registers a release note. Options: `--name`, `--bump minor\|major`, `--version X.Y.Z`                         |
| `pnpm release:list`                          | Lists registered releases                                                                                     |
| `pnpm release:rollback`                      | Shows the rollback plan. Add `--yes` to run it and register a new release                                     |
| `pnpm release:tag`                           | Tags a registered release in git                                                                              |
| `pnpm master:create`                         | Creates an ordinary account and writes its credentials to `local-env.env`. `--reset` clears only that account |

`vercel-build` runs `apps/api/scripts/record-release.mjs` after the web build to register the deployed commit.

## Related

- [[AI/backend/backend]]: Request flow of apps/api and the map of backend notes.
- [[AI/backend/authorization]]: Authentication, permission and ownership rules of the API.
