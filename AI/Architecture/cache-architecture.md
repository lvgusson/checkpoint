---
id: architecture.cache
title: Cache architecture
type: architecture-root
area: cache
status: active
owner: unknown
last_verified: 2026-10-12
source_paths:
  - web/src/data-cache.ts
  - web/src/scoring-settings.ts
  - api/src/steam.ts
  - api/src/wishlist.ts
  - api/src/app-user.ts
  - api/src/scoring.ts
  - api/src/auth.ts
  - api/src/version.ts
  - db/migrations/008_drop_queue_snapshot.sql
related_domains: [domain.game-library, domain.prioritization, domain.wishlist, domain.identity]
tags: [cache]
---

# Cache architecture

## 1. Purpose

Map actual cache responsibilities and their independent consistency mechanisms.

## 2. Scope and ownership

Browser response caching, persisted Steam prices and process memoization. Background reorder is application orchestration, not message-broker caching.

## 3. Architecture map

| State                               | Owner                       | Detail                                       |
| ----------------------------------- | --------------------------- | -------------------------------------------- |
| Browser data/settings               | DataCache                   | [Browser cache](cache/browser-data-cache.md) |
| Steam prices/tag vocabulary         | WishlistService/SteamClient | [Steam caches](cache/steam-caches.md)        |
| Identity/JWKS/version/normalization | process modules             | This map and linked security                 |

## 4. Contracts and behavior

Browser caches use stale-while-revalidate. Steam prices refresh on wishlist reads. Auth-to-app-user mappings cache successful promises without TTL; failed lookups evict. jose remote JWKS cacheMaxAge is ten minutes. currentVersion memoizes successful release information; Vercel fallback is not memoized, allowing a release row to appear later.

## 5. Invariants

No current materialized recommendation cache: migration 008 removes snapshot/version state and associated triggers. GameService computes recommendations from inputs each time. There is no Redis or durable message broker in inspected application code.

## 6. Dependencies

Depends on [frontend](front-end-architecture.md), [backend](back-end-architecture.md), [security](security/authentication-and-ownership.md) and [database](database/persistence.md).

## 7. Data and state

Scoring normalizes strings through a process Map, cleared when size exceeds 50000 before adding another entry; normalized tag sets use a WeakMap keyed by Game objects. Process caches reset on instance restart and are not shared across serverless instances.

## 8. Source references

`web/src/data-cache.ts`: DataCache; `api/src/app-user.ts`: createAppUserResolver; `api/src/auth.ts`: authenticatorFromEnv; `api/src/version.ts`: currentVersion; `api/src/scoring.ts`: normal/tagSet; migration 008.

## 9. Related documentation

[Architecture index](architecture-index.md), [background ordering](back-end/background-reordering.md), [domains](domains/domains-index.md).

## 10. Evidence and uncertainties

VERIFIED code/configuration mechanisms. UNKNOWN: process lifetimes and deployed migration state. Historical migration 002 is not evidence that snapshot tables remain current.
