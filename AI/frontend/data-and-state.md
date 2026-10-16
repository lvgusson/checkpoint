---
name: data-and-state
description: HTTP, query, cache, optimistic updates and error handling in the web app.
type: reference
area: frontend
---

# Data and state

## Layers

| Layer       | File              | Responsibility                                                                                                   |
| ----------- | ----------------- | ---------------------------------------------------------------------------------------------------------------- |
| Transport   | `api/http.ts`     | Ky client: token on API paths only, one refresh retry on 401, timeout, request id, no retries                    |
| Timing      | `api/timing.ts`   | Per-request timings (total, server, db, network) in `window.__timings`; `window.__timingSummary()` gives p50/p95 |
| Error shape | `api/errors.ts`   | `ApiError` parsed from problem+json or the legacy body                                                           |
| Cache       | `query/client.ts` | TanStack Query client: reads retry on transient errors, mutations never retry, 120 s fresh window                |
| Keys        | `query/keys.ts`   | `useQueryKeys()`; every key starts with the user id                                                              |
| Session     | `auth/`           | Supabase session, guards, safe redirect                                                                          |

There is exactly one retry owner: TanStack Query for reads.

Each request sends `X-Client-Sent-At`. The browser reads `Server-Timing` from the response. See [[AI/backend/observability]].

## Optimistic update recipe

1. `await queryClient.cancelQueries(...)` for every key you are about to patch.
2. Snapshot the previous values and patch the caches.
3. Send the mutation. On failure, restore the snapshot and invalidate.
4. Invalidate `keys.gameDependents()` or the precise keys on settle.

`features/playing/gameWriter.ts` is the reference implementation; `GameWriter.purchase(id)` is not optimistic. It waits for pending playing toggles, POSTs `games/:id/purchase`, writes the returned game into `k.game(id)` and invalidates dependents. The Wishlist screen uses its own `useWishlistActions().purchase` mutation.

`features/queue/useQueue.ts` shows ordered moves reconciled by a delayed refetch.

## Errors

Mutations without their own `onError` and background refetch errors reach the toast in `app/Shell.tsx`. A 403 from a catalog edit means admin only; show the server message.

## Modal queries and error boundaries

`GameDetailModal` loads game details and metadata catalog with bounded timeouts:

- Both queries use `MODAL_QUERY_TIMEOUT_MS = 20_000`, Ky 20 s timeout, and `retry: false`.
- Game loading ends in at most 20 s instead of hanging indefinitely.
- On game query error, the modal hides the loader and displays an alert with a retry action (`modal-game-retry`).
- On catalog query error, the modal displays an alert (`modal-catalog-error`) with a retry action (`modal-catalog-retry`).
- When the catalog is loading or in error, status, desire, and tag controls are disabled.

## Related

- [[AI/frontend/frontend]]: Folder map of apps/web and the map of frontend notes.
- [[AI/frontend/testid-map]]: Stable test IDs and screen elements.
- [[AI/backend/backend]]: Request flow of apps/api and the map of backend notes.
