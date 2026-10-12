---
id: architecture.cache.steam
title: Steam price and tag caches
type: module
area: cache
status: active
owner: unknown
last_verified: 2026-10-12
source_paths:
  - api/src/steam.ts
  - api/src/wishlist.ts
  - api/src/wishlist-repository.ts
  - api/test/steam.test.ts
related_domains: [domain.game-library, domain.prioritization, domain.wishlist, domain.identity]
tags: [cache]
---

# Steam price and tag caches

## 1. Purpose

Describe independent price and tag-vocabulary freshness mechanisms.

## 2. Scope and ownership

Owns six-hour price freshness and 24-hour tag memoization, excluding browser response caching.

## 3. Architecture map

| Cached value | Location                    | Key / lifetime                             |
| ------------ | --------------------------- | ------------------------------------------ |
| Price        | game_price or wishlist JSON | app ID + country in Pg; app ID locally; 6h |
| Tag names    | SteamClient.tags            | per instance; 24h                          |

## 4. Contracts and behavior

Wishlist listing fetches absent or older-than-six-hour prices on demand. Fetch failure logs and retains existing prices; forced refresh instead propagates mapped errors. Missing prices become unavailable records with fetchedAt, suppressing repeated fetches until expiry. Successful add/import can populate prices. Steam tag names refresh after 24h.

## 5. Invariants

Price cache is global to applications/country in Pg, independent of user wishlist membership. A null price is distinct from a free app. Fetched price timestamps control expiry; no scheduled refresh or eviction policy is implemented.

## 6. Dependencies

WishlistService reads/writes WishlistStore; SteamClient fetches pricing and tag vocabulary. [Integration](../back-end/wishlist-steam.md) owns HTTP retries.

## 7. Data and state

Pg upserts prices in one batched statement on steam_app_id/country_code. Local prices are persisted by app ID and do not carry a country namespace. Tags live only in process memory and have no in-flight request deduplication.

## 8. Source references

`api/src/wishlist.ts`: list/fetchPrices/refreshPrices; `api/src/wishlist-repository.ts`: prices/savePrices; `api/src/steam.ts`: tagNames; api/test/steam.test.ts stale-price fallback test.

## 9. Related documentation

[Cache root](../cache-architecture.md), [browser cache](browser-data-cache.md), [wishlist](../domains/wishlist/domain.md), [database](../database/persistence.md).

## 10. Evidence and uncertainties

VERIFIED against implementation and inspected mock tests. UNKNOWN: live Steam price consistency. Changing country in local mode can reuse an old price until refresh.
