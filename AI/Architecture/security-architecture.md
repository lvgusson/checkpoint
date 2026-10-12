---
id: architecture.security
title: Security architecture
type: architecture-root
area: security
status: active
owner: unknown
last_verified: 2026-10-11
source_paths:
  - api/src/auth.ts
  - api/src/app-user.ts
  - api/src/server.ts
  - db/migrations/003_rls.sql
  - web/src/auth/auth.service.ts
related_domains:
  - domain.identity
  - domain.game-library
tags: [security, authentication]
---

# Security architecture

## 1. Purpose

Map authentication, ownership and data-access boundaries.

## 2. Scope and ownership

Owns security navigation and cross-area boundaries. Domain policies, database schema details and deployment controls are linked to their canonical owners.

## 3. Architecture map

| Boundary                       | Location                                   | Detail                                                                   |
| ------------------------------ | ------------------------------------------ | ------------------------------------------------------------------------ |
| Browser session → API identity | `web/src/auth/`, `api/src/auth.ts`         | [Authentication and ownership](security/authentication-and-ownership.md) |
| SQL and Supabase Data API      | `api/src/pg-repository.ts`, RLS migrations | [Database access](security/database-access.md)                           |
| Runtime configuration          | `api/src/setup.ts`, `vercel.json`          | [Deployment](infrastructure/deployment-and-release.md)                   |

## 4. Contracts and behavior

VERIFIED: health, OpenAPI, public config and version endpoints precede authentication. Other `/api/` paths authenticate when an authenticator is configured. Request context propagates identity to repositories. API JSON responses use no-store.

## 5. Invariants

Production/Vercel without SUPABASE_URL fails protected authentication with 503. Browser route guards support navigation but server authentication is the API boundary. Database role permissions and row policies are separate from direct SQL application ownership predicates.

## 6. Dependencies

Identity depends on Supabase Auth/jose; personal PostgreSQL access depends on identity-to-app-user mapping. Catalogue changes cross security, database and game-library ownership.

## 7. Data and state

Browser session persistence and server request context are detailed in the identity leaf. RLS/grants and privileged functions are detailed in the database-access leaf. Credentials are configured outside committed source; ignore rules are process controls rather than proof that no secret has ever been committed.

## 8. Source references

`api/src/auth.ts#createAuthenticator`, `authenticatorFromEnv`; `api/src/server.ts#makeServer`; `api/src/context.ts#runWithContext`; `db/migrations/003_rls.sql`; `web/src/auth/auth.interceptor.ts#authInterceptor`.

## 9. Related documentation

[Architecture index](architecture-index.md), [identity domain](domains/identity/domain.md), [database root](database-architecture.md), [infrastructure root](infrastructure-architecture.md).

## 10. Evidence and uncertainties

VERIFIED from implementation and migration declarations. UNKNOWN: hosted Auth settings, actual SQL role, remote grants, branch protection and token/session revocation settings. No live database/security advisors were used. Current global catalogue writes have no observed curator-role restriction.
