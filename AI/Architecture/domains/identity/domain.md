---
id: domain.identity
title: Identity and ownership
type: domain
status: active
classification: generic
last_verified: 2026-10-12
source_paths:
  - scripts/master-user.mjs
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

Initialize public auth configuration, sign in/up, recover/change password, optionally OAuth, refresh token, sign out, and resolve/create application owner. Username sign-in maps a lowercase name to an email alias under gps.dev.br; it grants no additional authorization. The operational master account has an ordinary application owner and copied seed library. Its administrative provisioning contract is in [deployment operations](../../infrastructure/deployment-and-release.md). See [authentication and ownership](../../security/authentication-and-ownership.md) for exact flows.

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
