---
id: domain.wishlist
title: Wishlist acquisition
type: domain
status: active
classification: supporting
last_verified: 2026-10-12
source_paths:
  - api/src/wishlist.ts
  - api/src/wishlist-repository.ts
  - api/src/steam-mapping.ts
  - shared/models.ts
  - api/test/steam.test.ts
related_domains: [domain.game-library, domain.prioritization]
---

# Wishlist acquisition

## 1. Business purpose

Collect desired games manually or from Steam and display current known store prices.

## 2. Bounded context

Supporting acquisition capability over the same Game library. It does not maintain a separate Wishlist aggregate or independent game model.

## 3. Ubiquitous language

| Term         | Meaning                                     | Source               |
| ------------ | ------------------------------------------- | -------------------- |
| Desired game | Game with Desejado status                   | WishlistService.list |
| Steam app    | external appId and localized store metadata | SteamApp             |
| Price        | latest known sale/free/unavailable state    | SteamPrice           |
| Import       | created/existing/failed outcome batch       | WishlistImportResult |

## 4. Model

WishlistItem combines scored Game, optional price and description. WishlistService orchestrates external SteamClient and WishlistStore; gameFromSteamApp maps external vocabulary to the shared model.

## 5. Business invariants

Desired games stay outside the recommendation queue. Known app IDs in any library status are skipped on import. Adding an existing game returns its existing record; it does not reset its progress. Manual creation caps secondary tags at three.

## 6. Use cases and workflows

Search store; inspect app; add by appId/desire or manual fields; import a public profile; list desired games; refresh prices. Existing outcomes are idempotent for normal repeated submissions, with concurrency guarantees depending on storage constraints.

## 7. State transitions

Creation starts Desejado; common game PATCH can move it to other accepted statuses. Private/empty public wishlist import returns 404. Per-app missing/failed creations are reported; final price persistence can still fail the entire request.

## 8. Domain events

No acquisition domain-event publisher was found. Import results are synchronous response data.

## 9. Interfaces and integration

[Wishlist/Steam integration](../../back-end/wishlist-steam.md) owns external APIs, mapping and error contracts. [Wishlist UI](../../front-end/wishlist.md) consumes routes.

## 10. Persistence

[Database persistence](../../database/persistence.md) owns global game/catalogue metadata and personal library membership; [Steam caches](../../cache/steam-caches.md) owns price storage/freshness.

## 11. Dependencies and context map

Steam is upstream external vocabulary; mapping adapts tags into library genre/structure/coop. Game library owns subsequent editing, and prioritization excludes desired status. Browser mutation invalidates library-dependent cached views.

## 12. Implementation references

`api/src/wishlist.ts`: add/importSteam/list; `api/src/wishlist-repository.ts`: sameGame/create; `api/src/steam-mapping.ts`: emptyGame/gameFromSteamApp; api/test/steam.test.ts.

## 13. Linked subdomains

N/A. [Integration](../../back-end/wishlist-steam.md) and [cache mechanisms](../../cache/steam-caches.md) provide cohesive technical leaves.

## 14. Unknowns and inconsistencies

VERIFIED acquisition workflow. Supporting classification is inferred. Local sameGame name comparison normalizes accents/trim/case; Pg uses norm_key. Atomicity differs: new Pg catalogue enrichment occurs after initial creation transaction.
