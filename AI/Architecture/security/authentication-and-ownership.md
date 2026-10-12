---
id: architecture.security.identity
title: Authentication and application ownership
type: module
area: security
status: active
owner: unknown
last_verified: 2026-10-11
source_paths:
  - api/src/releases.ts
  - scripts/master-user.mjs
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

AuthService fetches `/api/v1/config` before initial navigation and creates the Supabase client with persistent sessions, automatic refresh and URL session detection. It supports email or username password sign-in (username mapping is owned by [the shell](../front-end/shell-and-authentication.md)), signup, recovery/change, optional GitHub OAuth and default local-scope sign-out. SIGNED_OUT and explicit sign-out clear the current data cache. The interceptor sends Bearer tokens only to relative `/api/` calls, excluding config; after 401 it shares a refresh promise, retries once and signs out if refresh/retry fails. `safeRedirect` permits internal paths while rejecting protocol-relative/external targets.

Release GET routes execute before application authentication; release POST requires its dedicated RELEASE_API_TOKEN, compared using timingSafeEqual after equal-length validation. Missing release token disables registration with 503; absent or wrong supplied token returns 401. This token does not create an application-user context.

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
