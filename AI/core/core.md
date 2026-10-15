---
name: core
description: Contracts in packages/core and the packages/ui-react kit, with their dependency rules.
type: hub
area: core
---

# Core packages

## `packages/core` (no framework, no vendor)

Shared contracts and pure domain rules live in `packages/core/src`.

Key files:

- `models.ts`: domain types (`Game`, `GameList`, `ScoringConfig`, `WishlistItem`).
- `metadata.ts`: controlled vocabulary catalog and normalization functions.
- `wishlist.ts`: wishlist sort definitions and item comparator.
- `authorization.ts`: roles, permissions, and policy rules.
- `problem.ts`: RFC 9457 error contracts.
- `observability.ts`: log formats and event schemas.
- `telemetry.ts`: client telemetry event contracts.

Dependency rule: `packages/core` imports nothing from React, Node-only APIs, Supabase, or apps.
The apps import from `packages/core` using relative paths to `packages/core/src`.

## Domain models and scoring contracts

`packages/core` provides contracts for scoring, purchases, and wishlists:

- Purchase timestamp: `Game.purchasedAt` is optional and nullable. It holds the first purchase time as an ISO string. Legacy data has no value.
- Recency weight: `ScoreWeights.recentPurchase` is the scoring bonus for a recent purchase. It decays linearly to zero over 30 days from `purchasedAt`.
- Wishlist items: `WishlistItem` combines a `ScoredGame` with optional `SteamPrice` and description.
- Wishlist sorting: `compareWishlistItems` sorts items by `'name'`, `'price'`, `'discount'`, or `'recommendation'`.
- Unavailable prices sort last. Ties break by name (pt-BR), then by id.
- Recommendation sort: `'recommendation'` orders wishlist entries by `game.baseScore` descending.

## Controlled metadata vocabulary

`packages/core/src/metadata.ts` standardizes metadata taxonomy:

- `MetadataCatalog`: defines categories for `genres`, `tags`, `paces`, `mechanics`, `stores`, `structures`, and `platforms`.
- `metadataFields`: maps catalog categories to properties on the `Game` model.
- `normalizeMetadata`: removes accents, trims whitespace, and converts strings to lowercase for matching.
- Database tables: backend drivers populate `MetadataCatalog` from existing database tables.

## `packages/ui-react` (product-agnostic UI kit)

| Export                                                    | Purpose                                                               |
| --------------------------------------------------------- | --------------------------------------------------------------------- |
| `useDataCollection`                                       | Filters, sort, page or cursor, URL sync, debounced search             |
| `PrefetchScheduler`                                       | Configurable prefetch of following pages; cancels when filters change |
| `SortableList`                                            | Drag and drop (pointer, keyboard); emits a move intent only           |
| `EmptyState`, `ErrorState`, `Pagination`, `ConfirmDialog` | Common states                                                         |

Dependency rule: the kit never imports from `apps/web`.
It knows nothing about games, queues, or wishlists.
The consuming application decides list order and persistence.

## Extract a package only when

A second real consumer exists. Until then keep new code inside the app's `features/`.

## Related

- [[AI/index]]: Entry point: pick the area you change and follow one link.
- [[AI/frontend/creating-a-component]]: Where a new component, screen or feature lives and how to build it.
- [[AI/backend/backend]]: Request flow of apps/api and the map of backend notes.
