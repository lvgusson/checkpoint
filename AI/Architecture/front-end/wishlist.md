---
id: architecture.frontend.wishlist
title: Wishlist interactions
type: module
area: frontend
status: active
owner: unknown
last_verified: 2026-10-11
source_paths:
  - web/src/wishlist.ts
  - web/src/wishlist-api.ts
  - shared/models.ts
related_domains:
  - domain.wishlist
  - domain.game-library
tags: [angular, frontend]
---

# Wishlist interactions

## 1. Purpose

Expose desired games, Steam discovery/import and price updates.

## 2. Scope and ownership

Owns acquisition forms, display sorting and request feedback. Steam access, enrichment, deduplication and persisted status are backend responsibilities.

## 3. Architecture map

| Responsibility     | Location                  | Detail                                               |
| ------------------ | ------------------------- | ---------------------------------------------------- |
| Wishlist page      | `web/src/wishlist.ts`     | `Wishlist`                                           |
| API/cache adapters | `web/src/wishlist-api.ts` | `WishlistApi`, `formatPrice`                         |
| Shared contracts   | `shared/models.ts`        | `WishlistItem`, `SteamPrice`, `WishlistImportResult` |

## 4. Contracts and behavior

List GET `/api/v1/wishlist` displays cached data immediately and revalidates when stale. Steam search GET `/steam/search?q=...` starts at two trimmed characters, debounces 300ms and displays at most eight results. Add POST `/wishlist` takes a Steam appId or manual name with optional genre/mainHours and selected desire. Import POST `/wishlist/import-steam` sends a trimmed profile or empty body and reports created/existing/failed counts. Add/import invalidate game-dependent caches and reload wishlist. Explicit price refresh POST `/wishlist/prices/refresh` replaces wishlist cache and displayed state.

Display sorting handles discount and price locally. Missing price, free app and unavailable final price have distinct labels; paid values use cent amounts and locale currency formatting.

## 5. Invariants

Wishlist entries wrap ordinary ScoredGame records; `Desejado` is a shared game status and is excluded from queue eligibility. Existing app results report their current status rather than inventing a newly created game.

## 6. Dependencies

FormsModule and RouterLink; WishlistApi uses HttpClient and DataCache. Steam traffic is mediated by the same-origin backend.

## 7. Data and state

Signals own items/results/loading/search/busy/error/notice. Search uses a timer and request counter. Wishlist cache is per-user; successful acquisition invalidates library/catalog/game/queue/wishlist entries. Currency values remain cent amounts in the contract.

## 8. Source references

`Wishlist.load`, `typed`, `add`, `addManual`, `importSteam`, `refresh`, `sorted`; `WishlistApi.list`, `changed`, `refreshPrices`; `formatPrice`; `shared/models.ts`: `WishlistItem`, `SteamPrice`.

## 9. Related documentation

[Frontend root](../front-end-architecture.md), [Library/detail](library-and-game-detail.md), [Cache](../cache-architecture.md), [Wishlist domain](../domains/wishlist/domain.md), [Game library](../domains/game-library/domain.md).

## 10. Evidence and uncertainties

VERIFIED from source; no live Steam calls or browser workflows were executed. UNKNOWN: deployed regional pricing and rate-limit behavior. Current wishlist desire options omit Imediata although the shared Desire type includes it.
