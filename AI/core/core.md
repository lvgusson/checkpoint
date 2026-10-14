---
type: hub
area: core
---

# Core packages

## `packages/core` (no framework, no vendor)

Shared contracts and pure rules: `models.ts` (domain types), `metadata.ts` (controlled vocabularies), `authorization.ts` (roles and permissions), `problem.ts` (error contract), `observability.ts` (log and telemetry contracts), `telemetry.ts` (browser event schema).

Dependency rule: `packages/core` imports nothing from React, Node-only APIs, Supabase or the apps. The apps import from it with a relative path to `packages/core/src`.

## `packages/ui-react` (product-agnostic UI kit)

| Export                                                                      | Purpose                                                                         |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `useDataCollection`                                                         | Filters, sort, page or cursor, view mode, selection, URL sync, debounced search |
| `PrefetchScheduler`                                                         | Configurable prefetch of following pages; cancels when filters change           |
| `SortableList`                                                              | Drag and drop (pointer, keyboard); emits a move intent only                     |
| `EmptyState`, `ErrorState`, `Pagination`, `ConfirmDialog`, `PermissionGate` | Common states                                                                   |

Dependency rule: the kit never imports from `apps/web`, and knows nothing about games, queues or wishlists. The app decides what a move means and persists it.

## Extract a package only when

A second real consumer exists. Until then keep new code inside the app's `features/`.

## Related

- [[AI/index]]
- [[AI/frontend/creating-a-component]]
- [[AI/backend/backend]]
