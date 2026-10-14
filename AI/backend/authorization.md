---
type: reference
area: backend
---

# Authorization

Three separate questions: who is calling (authentication), may this role do this action (permission), may this caller touch this record (ownership).

- **Authentication**: `apps/api/src/auth.ts` verifies the Supabase JWT locally with a cached JWKS. A legacy HS256 token falls back to a remote check that is cached and rate limited.
- **Permission**: `packages/core/src/authorization.ts` defines roles (`admin`, `user`) and a permission table, read with `can(role, permission)`. The role comes only from the token's `app_metadata.role`; unknown values become `user`. The Supabase `authenticated` claim is not a product role.
- **Ownership**: repositories filter by the owner id. Someone else's record answers 404, never 403.
- The shared catalog (`game` rows) is editable by `admin` only.
- A role change takes effect when the user's access token is renewed.

## Add a permission

1. Add the name to `permissions` in `packages/core/src/authorization.ts` and grant it to the right roles.
2. Check it in the route with `need(...)`, as the neighbouring routes in `server.ts` do.
3. Gate the UI with `PermissionGate` (`packages/ui-react`) for convenience only; the server stays the authority.

## Related

- [[AI/backend/backend]]
- [[AI/backend/extending-classes]]
