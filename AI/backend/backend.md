---
type: hub
area: backend
---

# Backend (`apps/api`)

Node 24 runs `.ts` files directly (type stripping), so imports carry the `.ts` extension. HTTP uses `node:http`, with no framework.

## Request flow

`apps/api/src/server.ts` routes a request: request id and security headers, body limit, authentication (`auth.ts`), permission check (`packages/core/src/authorization.ts`), then a `GameService` or `WishlistService` method, which calls repositories. Errors become RFC 9457 problem+json through `http-errors.ts`, with the legacy `error.message` kept for old clients. A resource owned by someone else answers 404.

## Where to go

- Hosting, storage modes, environment variables, scripts: [[AI/backend/infrastructure]]
- Add a route, a service method, a repository, a permission or a log sink: [[AI/backend/extending-classes]]
- Roles, permissions and the ownership rule: [[AI/backend/authorization]]
- Logging, metrics and the pluggable sink: [[AI/backend/observability]]
- Patterns used in this code: [[AI/patterns/design-patterns]]

## Related

- [[AI/index]]
- [[AI/core/core]]
