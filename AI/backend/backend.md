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
2. The router adds security headers. Body readers enforce size limits when a route reads JSON.
3. `apps/api/src/auth/auth.ts` authenticates the caller.
4. The central gate in `apps/api/src/main/server.ts` verifies permissions through `packages/core/src/authorization.ts`.
5. The route delegates work to domain services (`GameService`, `WishlistService`, or `ConfigService`).
6. Services query repositories, which execute operations through storage drivers.
7. Errors convert to RFC 9457 problem+json format through `apps/api/src/routes/http-errors.ts`.

System routes and release routes run before user authentication. Release registration uses a separate token.
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

- Game purchase: `POST /api/v1/games/:id/purchase` accepts no body or an empty JSON object. It moves `GameStatus.Wishlist` to `GameStatus.NotStarted`.
- Purchase retry: a game outside the wishlist returns unchanged only when `purchasedAt` exists. Otherwise, the service returns 409.
- Purchase callers: the Library card and the Wishlist card both call the purchase route.
- Purchase timestamp: the purchase route sets `purchasedAt` to the current ISO timestamp and preserves earlier purchase dates.
- Recency scoring: the scoring formula adds a bonus for recent purchases based on `purchasedAt`.
- Recency decay: the purchase bonus decreases linearly from full weight to zero across 30 days.
- Wishlist ordering: `WishlistService` sorts items by recommendation score (`baseScore`), price, discount, or name.
- Metadata configuration: `ConfigService` serves vocabulary categories loaded by `PgConfigDriver` from database tables.

## Where to go

- [[AI/backend/testing]]: Unit test commands, Vitest configuration, and local database test requirements.
- [[AI/backend/database-checklist]]: Steps to create a database table with indexes, audit columns, and access controls.
- [[AI/backend/infrastructure]]: Hosting, storage modes, environment variables and scripts of the API.
- [[AI/backend/extending-classes]]: Steps to add a repository, service method, route, permission or log sink.
- [[AI/backend/authorization]]: Authentication, permission and ownership rules of the API.
- [[AI/backend/observability]]: Why logging uses a pluggable sink, and how redaction and safety work.
- [[AI/backend/tracking]]: User navigation and click tracking via POST /api/v1/track, user_track, and page_track tables.
- [[AI/patterns/design-patterns]]: Design patterns in use, where they live, and how to expand a class.
- [[AI/backend/security]]: API security boundaries and isolated security tests.

## Related

- [[AI/index]]: Entry point: pick the area you change and follow one link.
- [[AI/core/core]]: Contracts in packages/core and the packages/ui-react kit, with their dependency rules.
