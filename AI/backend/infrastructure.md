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
| `apps/api/src`            | Server, services, repositories, auth, observability                  |
| `apps/api/index.mjs`      | Vercel Function entry; plain JS that loads the `.ts` sources         |
| `apps/api/openapi.json`   | API contract, served at `/api/v1/openapi.json`                       |
| `apps/api/infra/db`       | Plain-Postgres migrations and the seed generator                     |
| `apps/api/infra/supabase` | Supabase CLI project; its `migrations` folder is canonical to deploy |
| `apps/api/infra/data`     | Seed inputs (metadata, wishlist snapshot)                            |
| `apps/api/scripts`        | Release, rollback, metadata and master-user scripts                  |
| `scripts/dev.mjs`         | Starts API and web together for `pnpm dev`                           |

## Storage modes

`createService` in `apps/api/src/main/setup.ts` chooses persistence from the environment.
When `DATABASE_URL` is set, it uses Postgres with the Supabase pooler in transaction mode.
Without `DATABASE_URL`, it uses local JSON files in `DATA_DIR`.
The default path is `checkpoint` in the operating system temporary folder.
Use local storage for development only; the Vercel filesystem is ephemeral.

## Environment variables

`.env.example` lists the main variables.
Search `process.env` and `env.` in `apps/api` for other variables.
Variable groups include Supabase (`SUPABASE_URL`), database (`DATABASE_URL`), logging (`LOG_SINK`), and release tooling.

## Hosting

Vercel builds the web app (`apps/web/dist`) and runs the API as one function through `vercel.json`. Without authentication configured the API refuses to start on Vercel or in production. No-auth mode exists only on a loopback host outside production.

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
