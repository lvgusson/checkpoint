# Security documentation history

This append-only archive preserves exact superseded architectural content. Follow [the deprecation template](../deprecation-template.md) before replacing active facts. No deprecations are fabricated for previously undocumented behavior.


## DEP-20261012-release-integration-pending-7

- Date: 2026-10-12T12:00:00-03:00
- Source: `AI/Architecture/domains/identity/domain.md`
- Original document ID: `domain.identity`
- Original section: `entire document`
- Reason: Synchronize the integrated application and append-only release contracts.
- Replacement: `AI/Architecture/domains/identity/domain.md`
- Related code: `api/src/releases.ts`, `web/src/finish-dialog.ts`, `AI/read-main-entry.mjs`
- Change reference: approved release integration

### Exact previous content

````markdown
---
id: domain.identity
title: Identity and ownership
type: domain
status: active
classification: generic
last_verified: 2026-10-12
source_paths:
  - api/src/auth.ts
  - api/src/app-user.ts
  - api/src/context.ts
  - web/src/auth/auth.service.ts
related_domains: [domain.game-library, domain.prioritization, domain.wishlist]
---

# Identity and ownership

## 1. Business purpose

Associate authenticated people with the application owner whose library and lists they access.

## 2. Bounded context

Generic access capability backed by Supabase Auth. Canonical token/session/security rules live in the security architecture; this domain map records ownership language and relationships.

## 3. Ubiquitous language

| Term              | Meaning                                        | Source                |
| ----------------- | ---------------------------------------------- | --------------------- |
| Auth user         | verified JWT subject                           | AuthUser              |
| Application owner | app_user ID used by repositories               | AppUserResolver       |
| Request context   | propagated identity/token/email and request ID | RequestContext        |
| Seed owner        | preexisting owner claimable by matching email  | createAppUserResolver |

## 4. Model

AuthUser and RequestContext are plain structures; AppUserResolver is an injected async function. Supabase owns credentials and sessions. No local identity aggregate implementation was found.

## 5. Business invariants

Backend owner identity comes from verified authentication or explicit development/test context. Direct PostgreSQL adapters must apply owner predicates; browser route guards do not authorize database access.

## 6. Use cases and workflows

Initialize public auth configuration, sign in/up, recover/change password, optionally OAuth, refresh token, sign out, and resolve/create application owner. See [authentication and ownership](../../security/authentication-and-ownership.md) for exact flows.

## 7. State transitions

An auth subject resolves an existing app_user, may claim the unlinked seed owner using matching email, or creates an empty owner. Resolved appUserId is memoized in request context and successful auth-to-owner promises in the process.

## 8. Domain events

Browser Supabase auth-state notifications drive session UI/cache cleanup. No application identity domain-event bus is implemented.

## 9. Interfaces and integration

[Security authentication](../../security/authentication-and-ownership.md), [database access](../../security/database-access.md) and [frontend shell/auth](../../front-end/shell-and-authentication.md) own integration specifics.

## 10. Persistence

[Database persistence](../../database/persistence.md) owns app_user relationships; Supabase owns auth.users. No secrets or credentials belong in this documentation.

## 11. Dependencies and context map

Identity is upstream of game library, prioritization and wishlist owner access; cache namespaces use auth user ID. PostgreSQL global catalogue and price state remain shared.

## 12. Implementation references

`api/src/auth.ts`: createAuthenticator/authenticatorFromEnv; `api/src/app-user.ts`: createAppUserResolver; `api/src/context.ts`: runWithContext/setContext; `web/src/auth/auth.service.ts`: AuthService.

## 13. Linked subdomains

N/A. Security leaves are canonical, avoiding duplicated cryptographic and session detail.

## 14. Unknowns and inconsistencies

VERIFIED ownership flow, generic classification inferred. UNKNOWN: hosted auth settings and policies. Process owner cache has no TTL and assumes mappings remain stable.
````

## DEP-20261012-release-integration-pending-8

- Date: 2026-10-12T12:00:00-03:00
- Source: `AI/Architecture/security/authentication-and-ownership.md`
- Original document ID: `architecture.security.identity`
- Original section: `entire document`
- Reason: Synchronize the integrated application and append-only release contracts.
- Replacement: `AI/Architecture/security/authentication-and-ownership.md`
- Related code: `api/src/releases.ts`, `web/src/finish-dialog.ts`, `AI/read-main-entry.mjs`
- Change reference: approved release integration

### Exact previous content

````markdown
---
id: architecture.security.identity
title: Authentication and application ownership
type: module
area: security
status: active
owner: unknown
last_verified: 2026-10-11
source_paths:
  - api/src/auth.ts
  - api/src/app-user.ts
  - api/src/context.ts
  - api/src/server.ts
  - web/src/auth/auth.service.ts
  - web/src/auth/auth.interceptor.ts
  - web/src/auth/auth.guard.ts
related_domains:
  - domain.identity
  - domain.game-library
tags: [jwt, sessions, ownership]
---

# Authentication and application ownership

## 1. Purpose

Explain how browser sessions become API identities and personal database owners.

## 2. Scope and ownership

Owns token validation, request identity and auth-to-app-user resolution. SQL policies are in the separate database-access leaf; browser data caching is documented by the frontend/cache owners.

## 3. Architecture map

| Stage                  | Source                             | Contract                                                |
| ---------------------- | ---------------------------------- | ------------------------------------------------------- |
| Public configuration   | `api/src/auth.ts`                  | `publicAuthConfig` returns URL/public key/provider flag |
| Session lifecycle      | `web/src/auth/auth.service.ts`     | `AuthService` mirrors Supabase session                  |
| Request token          | `web/src/auth/auth.interceptor.ts` | Relative API requests only                              |
| Signature verification | `api/src/auth.ts`                  | `createAuthenticator`                                   |
| Request identity       | `api/src/context.ts`               | AsyncLocalStorage                                       |
| Personal owner         | `api/src/app-user.ts`              | `createAppUserResolver`                                 |

## 4. Contracts and behavior

AuthService fetches `/api/v1/config` before initial navigation and creates the Supabase client with persistent sessions, automatic refresh and URL session detection. It supports password sign-in, signup, recovery/change, optional GitHub OAuth and default local-scope sign-out. SIGNED_OUT and explicit sign-out clear the current data cache. The interceptor sends Bearer tokens only to relative `/api/` calls, excluding config; after 401 it shares a refresh promise, retries once and signs out if refresh/retry fails. `safeRedirect` permits internal paths while rejecting protocol-relative/external targets.

The API accepts Bearer headers. jose verifies issuer and authenticated audience with ES256/RS256/EdDSA; JWKS cache duration is configured to ten minutes. HS256 is delegated to Supabase `/auth/v1/user` when a public API key is available. Expiry/invalid tokens become 401; JWKS timeout/network failures become 503. Missing SUPABASE_URL returns null only outside production/Vercel and otherwise supplies a failing authenticator.

## 5. Invariants

The API trusts verified token subject for identity. Role claims are returned but no curator/admin authorization branch is implemented in this mechanism. Production protected routes cannot silently disable authentication when SUPABASE_URL is absent. AuthService cannot initialize without public config, and browser guard decisions do not replace server validation.

## 6. Dependencies

`makeServer` authenticates and calls `setContext`; downstream repositories call the application-user resolver. External dependencies are Supabase Auth and jose. [Database access](database-access.md) explains the different Data API policy path.

## 7. Data and state

AsyncLocalStorage keeps request ID, subject, access token, email and resolved app-user ID per request. The resolver first uses existing request appUserId, then maps auth_user_id, then conditionally claims the unlinked seed owner using token email against seed email or SEED_OWNER_EMAIL, otherwise inserts an app_user. Successful mapping promises are cached per instance; failures remove their cache entries. Development may supply a default owner when auth is disabled. Mapping is separate from the SQL RPC `ensure_app_user` used by the Data API.

Locally verified JWT requests do not query session revocation state on each request. Hosted expiry/confirmation settings were not verified.

## 8. Source references

`api/src/auth.ts#createAuthenticator`, `remoteUserFallback`, `authenticatorFromEnv`, `publicAuthConfig`; `api/src/context.ts#runWithContext`, `setContext`; `api/src/app-user.ts#createAppUserResolver`; `web/src/auth/auth.service.ts#AuthService`; `web/src/auth/auth.interceptor.ts#authInterceptor`; `web/src/auth/auth.guard.ts#safeRedirect`.

## 9. Related documentation

[Security root](../security-architecture.md), [identity domain](../domains/identity/domain.md), [persistence](../database/persistence.md), [database access](database-access.md).

## 10. Evidence and uncertainties

VERIFIED against current source, including the current `clearDataCache` call sites. UNKNOWN: hosted email-confirmation/provider settings, refresh/session limits and token invalidation behavior. Seed claiming depends on the verified token email; deployment-specific email confirmation policy needs separate evidence. Auth-enabled JSON fallback selects shared repositories rather than PostgreSQL per-user filtering.
````

## DEP-20261012-release-integration-pending-14

- Date: 2026-10-12T12:00:00-03:00
- Source: `AI/Architecture/security/database-access.md`
- Original document ID: `architecture.security.database-access`
- Original section: `entire document`
- Reason: Synchronize the integrated application and append-only release contracts.
- Replacement: `AI/Architecture/security/database-access.md`
- Related code: `api/src/releases.ts`, `web/src/finish-dialog.ts`, `AI/read-main-entry.mjs`
- Change reference: approved release integration

### Exact previous content

````markdown
---
id: architecture.security.database-access
title: Database access boundaries
type: component
area: security
status: active
owner: unknown
last_verified: 2026-10-11
source_paths:
  - db/migrations/003_rls.sql
  - db/migrations/006_app_release.sql
  - db/migrations/011_game_lists.sql
  - db/migrations/014_steam_price.sql
  - supabase/migrations/20261011154854_supabase_hardening.sql
  - api/src/pg-repository.ts
related_domains:
  - domain.identity
  - domain.game-library
  - domain.prioritization
  - domain.wishlist
tags: [rls, grants, trust]
---

# Database access boundaries

## 1. Purpose

Distinguish direct SQL owner predicates from Supabase Data API permissions.

## 2. Scope and ownership

Owns declared database access controls and privileged function boundaries. It does not assert which SQL role the deployed API uses.

## 3. Architecture map

| Access path              | Evidence                            | Enforcement                                             |
| ------------------------ | ----------------------------------- | ------------------------------------------------------- |
| Node direct SQL          | `api/src/pg-repository.ts`          | Resolved app_user predicates and ownership foreign keys |
| Supabase Data API        | `db/migrations/003_rls.sql`         | Grants plus RLS policies                                |
| Supabase hardening       | Timestamped hardening migration     | Reduced grants and function execution/search paths      |
| Internal release records | `db/migrations/006_app_release.sql` | RLS without client policies, revoked grants             |

## 4. Contracts and behavior

Catalogue tables allow SELECT to anon/authenticated using true policies. Personal library/settings/pins use current_app_user_id for USING and WITH CHECK. app_user SELECT/UPDATE policies bind auth_user_id to auth.uid. game_list follows owner access; game_price follows public catalogue read access. queue_move_event grants SELECT/INSERT with owner checks; clients cannot UPDATE/DELETE through those permissions. Internal schema_migration and app_release enable RLS without client policies.

`library_card` is security_invoker on PostgreSQL 15+. `current_app_user_id` and `ensure_app_user` are SECURITY DEFINER with fixed search_path; ensure_app_user rejects null auth.uid. Some internal catalogue propagation helpers are also SECURITY DEFINER. Hardening reduces broad Supabase table/sequence grants, restricts ensure_app_user and queue mutation execution, and fixes additional search paths. The later list migration replaces queue function signatures and applies explicit execute permissions to them.

## 5. Invariants

Grants determine object access; RLS determines rows for roles subject to it. Direct connection alone does not bypass RLS: runtime privilege depends on the actual SQL role. Current direct SQL code does not switch to authenticated or set JWT claims, and it explicitly restricts personal operations by the application owner. List composite foreign keys prevent cross-owner list references.

## 6. Dependencies

Policies depend on auth.uid and application-user mapping. Direct repositories depend on [authentication and ownership](authentication-and-ownership.md). Schema exceptions and migration sequence are in [migrations](../database/migrations.md).

## 7. Data and state

App-user ownership is the personal-data boundary. Catalogue fields are shared. PgGameRepository.save selects a target through the current owner library but then updates global game/tag fields; no curator check was found. queue_move_event is append-only for client grants, while privileged administrative operations and list/user cascades can change its lifetime. RLS permissions do not make audit history globally immutable.

## 8. Source references

`db/migrations/003_rls.sql#current_app_user_id`, `ensure_app_user`, `app_user_self_update`; `db/migrations/001_init.sql#trg_game_propagate`; `db/migrations/006_app_release.sql`; `db/migrations/011_game_lists.sql#game_list_owner`; `db/migrations/014_steam_price.sql#game_price_read`; `supabase/migrations/20261011154854_supabase_hardening.sql`; `api/src/pg-repository.ts#PgGameRepository.save`.

## 9. Related documentation

[Security root](../security-architecture.md), [database root](../database-architecture.md), [identity domain](../domains/identity/domain.md), [game library](../domains/game-library/domain.md).

## 10. Evidence and uncertainties

VERIFIED declarations and executable predicates. UNKNOWN: actual deployed roles/BYPASSRLS, grants, exposed schemas and applied hardening. Numbered migration 003 alone does not include every Supabase-only grant reduction. No SQL security tests, live policies or advisors were executed in this investigation.
````
