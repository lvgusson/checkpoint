---
name: authorization
description: Authentication, permission and ownership rules of the API.
type: reference
area: backend
---

# Authorization

Three separate questions: who is calling (authentication), may this role do this action (permission), may this caller touch this record (ownership).

- **Authentication**: `apps/api/src/auth/auth.ts` verifies the Supabase JWT locally with a cached JWKS. A legacy HS256 token falls back to a remote check that is cached and rate limited.
- **Permission**: `packages/core/src/authorization.ts` defines roles (`admin`, `user`) and a permission table, read with `can(role, permission)`. The role comes only from the token's `app_metadata.role`; unknown values become `user`. The Supabase `authenticated` claim is not a product role.
- **Ownership**: repositories filter by the owner id. Someone else's record answers 404, never 403.
- Only `admin` can edit the shared catalog (`game` rows). One exception: the user who creates a shared row by Steam import can fill its catalog fields (`apps/api/src/data/repositories/games.ts`, creator flag).
- Local JWT verification reads the role from the current token. HS256 verification refreshes the remote role after its accepted-token cache expires.

## Add a permission

1. Add the name to `Permission` in `packages/core/src/authorization.ts` and grant it to the right roles.
2. Wire it in the central gate in `apps/api/src/main/server.ts`. GET, HEAD, and tracking need `games:read`.
   Writes under `/settings/` need `settings:update`. Other protected writes need `games:update`. Telemetry precedes this permission gate.
3. Hide UI the caller cannot use for convenience only; the server stays the authority.

## Related

- [[AI/backend/backend]]: Request flow of apps/api and the map of backend notes.
- [[AI/backend/extending-classes]]: Steps to add a repository, service method, route, permission or log sink.
- [[AI/backend/infrastructure]]: Hosting, storage modes, environment variables and scripts of the API.
- [[AI/backend/security]]: API security boundaries and isolated security tests.
