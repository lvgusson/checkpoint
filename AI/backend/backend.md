---
name: backend
description: Request flow of apps/api and the map of backend notes.
type: hub
area: backend
---

# Backend (`apps/api`)

Node 24 runs `.ts` files directly through type stripping.
Imports carry the `.ts` extension.
HTTP uses `node:http` without a framework.

## Request flow

1. The router in `apps/api/src/main/server.ts` assigns the request identifier.
2. The router adds security headers and enforces the request body limit.
3. `apps/api/src/auth/auth.ts` authenticates the caller.
4. The route verifies permissions through `packages/core/src/authorization.ts`.
5. The route delegates work to domain services (`GameService`, `WishlistService`, or `ConfigService`).
6. Services query repositories, which execute operations through storage drivers.
7. Errors convert to RFC 9457 problem+json format through `apps/api/src/routes/http-errors.ts`.

A resource owned by another user returns HTTP 404.
The API retains the legacy `error.message` field for compatibility with older clients.

## Data layer architecture

The data layer uses the Repository and Drivers pattern to replace old monolith repositories.
Repositories in `apps/api/src/data/repositories/` implement domain ports in `apps/api/src/data/ports.ts`.
Repositories map data errors and resolve user tenancy.
Drivers in `apps/api/src/data/drivers/` perform storage operations without business logic.
Postgres drivers (`PgDriver` in `apps/api/src/data/drivers/pg/`) execute SQL queries.
JSON drivers (`JsonDriver` in `apps/api/src/data/drivers/json/`) manage local JSON files.

## Features and scoring

`GameService` and `WishlistService` provide game management and recommendations.

- Game purchase: `POST /api/v1/games/:id/purchase` moves a game from wishlist to library (`GameStatus.NotStarted`).
- Purchase timestamp: the purchase route sets `purchasedAt` to the current ISO timestamp and preserves earlier purchase dates.
- Recency scoring: the scoring formula adds a bonus for recent purchases based on `purchasedAt`.
- Recency decay: the purchase bonus decreases linearly from full weight to zero across 30 days.
- Wishlist ordering: `WishlistService` sorts items by recommendation score (`baseScore`), price, discount, or name.
- Metadata configuration: `ConfigService` serves vocabulary categories loaded by `PgConfigDriver` from database tables.

## Where to go

- Hosting, storage modes, environment variables, scripts: [[AI/backend/infrastructure]]
- Add a route, a service method, a repository, a permission or a log sink: [[AI/backend/extending-classes]]
- Roles, permissions and the ownership rule: [[AI/backend/authorization]]
- Logging, metrics and the pluggable sink: [[AI/backend/observability]]
- Patterns used in this code: [[AI/patterns/design-patterns]]
- Threat model, attack test suite, and validation: [[AI/backend/security]]

## Related

- [[AI/index]]: Entry point: pick the area you change and follow one link.
- [[AI/core/core]]: Contracts in packages/core and the packages/ui-react kit, with their dependency rules.
