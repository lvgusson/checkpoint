---
id: architecture.backend.wishlist
title: Wishlist and Steam integration
type: module
area: backend
status: active
owner: unknown
last_verified: 2026-10-12
source_paths:
  - api/src/wishlist.ts
  - api/src/wishlist-routes.ts
  - api/src/wishlist-repository.ts
  - api/src/steam.ts
  - api/src/steam-mapping.ts
  - api/test/steam.test.ts
related_domains: [domain.wishlist, domain.game-library]
tags: [backend]
---

# Wishlist and Steam integration

## 1. Purpose

Explain acquisition integration and Steam request orchestration.

## 2. Scope and ownership

Owns Steam transport and mapping, WishlistService orchestration and WishlistStore contract. [Wishlist domain](../domains/wishlist/domain.md) owns acquisition semantics; [Steam caches](../cache/steam-caches.md) owns freshness.

## 3. Architecture map

| Capability         | Symbol                             | Contract                       |
| ------------------ | ---------------------------------- | ------------------------------ |
| Search/details     | SteamClient.search/apps            | store results                  |
| Profile resolution | resolveSteamId                     | SteamID64 or vanity URL        |
| Public import      | WishlistService.importSteam        | created/existing/failed counts |
| Mapping            | gameFromSteamApp                   | desired Game                   |
| Prices             | WishlistService.list/refreshPrices | WishlistItem[]                 |

## 4. Contracts and behavior

Search requires 1..100 characters; app IDs are positive integers up to signed int32 maximum. Steam creation accepts only appId and optional desire. Manual creation has an allowlist and name limit 300. Import uses supplied or default profile, resolves identity, fetches public wishlist, ignores known app IDs in all statuses, and records per-item failures. Empty/private wishlist returns 404.

## 5. Invariants

Steam-created/manual games start Desejado. Tags map to genre, coop and structure; secondary tags are capped at three. Existing entries keep their status. Steam errors with 4xx status are passed through; other Steam errors become 502.

## 6. Dependencies

Store search and IStoreBrowseService/GetItems need no key; vanity resolution needs the configured API key. IWishlistService/GetWishlist reads public profiles; tag vocabulary uses IStoreService/GetTagList. Requests use labeled errors rather than URL disclosure.

## 7. Data and state

Details fetch in sequential batches of 50 with parallel tag loading. getJson uses per-attempt eight-second timeout, up to three total attempts (at most two retries) for transient failures; generic retry defaults remain five elsewhere. Pg initial acquisition transaction precedes a separate new-catalog GameRepository.save, allowing partial success.

## 8. Source references

`api/src/steam.ts`: SteamClient/getJson/rawItems; `api/src/steam-mapping.ts`: gameFromSteamApp/emptyGame; `api/src/wishlist.ts`: WishlistService; api/test/steam.test.ts.

## 9. Related documentation

[Backend root](../back-end-architecture.md), [wishlist domain](../domains/wishlist/domain.md), [Steam caches](../cache/steam-caches.md), [database](../database/persistence.md).

## 10. Evidence and uncertainties

VERIFIED source and mock-based tests. UNKNOWN: current live Steam availability and rate limits; no external calls were made. No owned-game synchronization is implemented by this workflow.
