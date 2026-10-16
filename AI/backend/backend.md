---
name: backend
description: Request flow of apps/api and the map of backend notes.
type: hub
area: backend
---

# Backend (`apps/api`)

Node 24 runs `.ts` files directly through type stripping.
Imports carry the `.ts` extension.
HTTP uses Fastify 5 (`fastify`). Fastify handles hooks, errors and responses only.
One catch-all route (`/*`) sends every request to the route modules, which match their own paths.
Outbound HTTP uses native `fetch` (one call, in `auth.ts`). The project does not use axios.

## Request flow

1. `makeServer` in `apps/api/src/main/server.ts` builds the Fastify app. `genReqId` assigns the request identifier.
2. The `onRequest` hook adds security headers. The route reads the body itself with `readJson` and enforces the size limit after authentication.
3. `apps/api/src/auth/auth.ts` authenticates the caller.
4. The central gate in `apps/api/src/main/server.ts` verifies permissions through `packages/core/src/authorization.ts`.
5. The route delegates work to domain services (`GameService`, `WishlistService`, or `ConfigService`).
6. Services query repositories, which execute operations through storage drivers.
7. `setErrorHandler` and `frameworkErrors` convert errors to RFC 9457 problem+json through `apps/api/src/routes/http-errors.ts`.
8. The `onResponse` hook writes the `http.request` log line and the timing metric.

A resource owned by another user returns HTTP 404.
The API retains the legacy `error.message` field for compatibility with older clients.

## Data layer architecture

The data layer uses the Repository and Drivers pattern to replace old monolith repositories.
Repositories in `apps/api/src/data/repositories/` implement domain ports in `apps/api/src/data/ports.ts`.
Repositories map data errors and resolve user tenancy.
Drivers in `apps/api/src/data/drivers/` perform storage operations without business logic.
Postgres drivers (`PgGamesDriver` and other `Pg*Driver` classes in `apps/api/src/data/drivers/pg/`) execute SQL queries.
JSON drivers (`JsonGamesDriver` and other `Json*Driver` classes in `apps/api/src/data/drivers/json/`) manage local JSON files.

## Features and scoring

`GameService` and `WishlistService` provide game management and recommendations.

- Game purchase: `POST /api/v1/games/:id/purchase` accepts an empty body only. It moves a `Desejado` game to `GameStatus.NotStarted`. A repeat call on a purchased game returns it unchanged. Any other status returns 409. The Library card and the Wishlist card both call it.
- Purchase timestamp: the purchase route sets `purchasedAt` to the current ISO timestamp and preserves earlier purchase dates.
- Recency scoring: the scoring formula adds a bonus for recent purchases based on `purchasedAt`.
- Recency decay: the purchase bonus decreases linearly from full weight to zero across 30 days.
- Wishlist ordering: `WishlistService` sorts items by recommendation score (`baseScore`), price, discount, or name.
- Metadata configuration: `ConfigService` serves vocabulary categories loaded by `PgConfigDriver` from database tables.

## Where to go

- Unit tests and local database checks: [[AI/backend/testing]]

- New database tables: [[AI/backend/database-checklist]]: Steps to create a database table with indexes, audit columns, and access controls.

- Hosting, storage modes, environment variables, scripts: [[AI/backend/infrastructure]]
- Add a route, a service method, a repository, a permission or a log sink: [[AI/backend/extending-classes]]
- Roles, permissions and the ownership rule: [[AI/backend/authorization]]
- Logging, metrics and the pluggable sink: [[AI/backend/observability]]
- User tracking and page metrics: [[AI/backend/tracking]]: Fire-and-forget user navigation and click tracking architecture.
- Patterns used in this code: [[AI/patterns/design-patterns]]
- Threat model, attack test suite, and validation: [[AI/backend/security]]

## Related

- [[AI/index]]: Entry point: pick the area you change and follow one link.
- [[AI/core/core]]: Contracts in packages/core and the packages/ui-react kit, with their dependency rules.
