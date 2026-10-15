---
name: infinite-scroll
description: Infinite scroll pattern using useInfiniteScroll and paginated queries.
type: how-to
area: frontend
---

# How to use infinite scroll

This guide describes how to implement infinite scroll pagination in lists and catalogs.

## Architecture

Infinite scroll uses two layers:

1. `apps/web/src/hooks/useInfiniteScroll.ts`:
   A generic hook that observes a sentinel element with `IntersectionObserver`.
   It triggers `onLoadMore` when the sentinel enters the viewport.

2. A feature hook (such as `useInfiniteCatalog`):
   Loads pages sequentially with `useQueries`.
   Deduplicates items by id across pages.
   Resets pagination to page 1 when search or filters change.

## Implementation steps

1. Call `useInfiniteScroll` with the load callback:
   Set `hasMore` and `isLoading` flags to prevent duplicate fetches.

2. Place a sentinel element at the bottom of the items container:
   Assign `ref={sentinelRef}` to the sentinel element.

3. Render a loading indicator when `isFetchingNextPage` is true:
   Keep existing items visible while loading subsequent pages.

4. Render a retry button when subsequent page requests fail:
   Do not replace loaded items with a full-page error state.

5. Reset page counter to 1 when filters or search change:
   Clear previous page results immediately.

## Related

- [[AI/frontend/frontend]]: Folder map of apps/web and the map of frontend notes.
- [[AI/frontend/data-and-state]]: HTTP, query, cache, optimistic updates and error handling in the web app.
- [[AI/core/core]]: Contracts in packages/core and the packages/ui-react kit.
