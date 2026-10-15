---
name: backend
description: Request flow of apps/api and the map of backend notes.
type: hub
area: backend
---

# Backend (`apps/api`)

Node 24 runs `.ts` files directly (type stripping), so imports carry the `.ts` extension. HTTP uses `node:http`, with no framework.

## Request flow

The router in `apps/api/src/main/server.ts` processes requests in order: request id, security headers, body limit, and authentication in `apps/api/src/auth/auth.ts`.
Next, the route checks permissions with `packages/core/src/authorization.ts`.
Then the route calls `GameService` or `WishlistService`, which query repositories.
Errors become RFC 9457 problem+json through `apps/api/src/routes/http-errors.ts`.
The API keeps the legacy `error.message` field for old clients.
A resource owned by another user returns 404.

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
