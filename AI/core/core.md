---
name: core
description: Contracts in packages/core and the packages/ui-react kit, with their dependency rules.
type: hub
area: core
---

# Core packages

## `packages/core` (no framework, no vendor)

Shared contracts and pure rules live in `packages/core/src`.
Key files: `models.ts` (types), `metadata.ts` (vocabularies), `authorization.ts` (roles), `problem.ts` (errors), `observability.ts` (logs), and `telemetry.ts` (client events).

Dependency rule: `packages/core` imports nothing from React, Node-only APIs, Supabase or the apps. The apps import from it with a relative path to `packages/core/src`.

## `packages/ui-react` (product-agnostic UI kit)

| Export                                                    | Purpose                                                               |
| --------------------------------------------------------- | --------------------------------------------------------------------- |
| `useDataCollection`                                       | Filters, sort, page or cursor, URL sync, debounced search             |
| `PrefetchScheduler`                                       | Configurable prefetch of following pages; cancels when filters change |
| `SortableList`                                            | Drag and drop (pointer, keyboard); emits a move intent only           |
| `EmptyState`, `ErrorState`, `Pagination`, `ConfirmDialog` | Common states                                                         |

Dependency rule: the kit never imports from `apps/web`, and knows nothing about games, queues or wishlists. The app decides what a move means and persists it.

## Extract a package only when

A second real consumer exists. Until then keep new code inside the app's `features/`.

## Related

- [[AI/index]]: Entry point: pick the area you change and follow one link.
- [[AI/frontend/creating-a-component]]: Where a new component, screen or feature lives and how to build it.
- [[AI/backend/backend]]: Request flow of apps/api and the map of backend notes.
