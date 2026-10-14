---
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

`createService` in `apps/api/src/setup.ts` picks persistence from the environment: with `DATABASE_URL` it uses Postgres (Supabase pooler, transaction mode); without it, local JSON files in `apps/api/data` (development only; on Vercel the filesystem is ephemeral).

## Environment variables

`.env.example` lists them all. Groups: Supabase (`SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`), database (`DATABASE_URL`, `DATABASE_URL_SESSION`), logging (`LOG_SINK`, `LOG_LEVEL`, `LOG_FILE`), release tooling.

## Hosting

Vercel builds the web app (`apps/web/dist`) and runs the API as one function through `vercel.json`. Without authentication configured the API refuses to start on Vercel or in production. No-auth mode exists only on a loopback host outside production.

## Related

- [[AI/backend/backend]]
- [[AI/backend/authorization]]
