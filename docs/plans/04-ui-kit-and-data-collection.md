# Plan 04 — UI kit and DataCollection capability (operational)

Source: analysis §4, §8 (8.1-8.3), Stage C. Depends on Plan 03 (React) for all code; this plan is design plus extraction rules until the first React screen exists.

## 1. Goal

Reusable, product-agnostic collection primitives in React, extracted only after two real Checkpoint screens (Library, Queue; Wishlist as third consumer) use them. No package publishing.

## 2. Current behavior (evidence)

The web app is Angular (signals, `ngModel`), not React. Nothing below is reusable as code; it is a behavioral spec to preserve.

| Concern                | Today                                                                                                                                                                                                                                              | Evidence                                               |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| Library pagination     | Numeric page, fixed `pageSize: 24`, prev/next buttons, "Página X de Y"; filters `q`, `status`, `primaryGenre`, `store`, `sort`; search debounced 250 ms; filter change resets page to 1                                                            | `web/src/library.ts:134-138,148-160,217-235,254-259`   |
| Does the API paginate? | Yes, offset style, but only after loading everything: `service.all()` then in-memory filter, sort, `slice`. `pageSize` clamped 1-100. Response `{items,total,page,pageSize}`. No cursor, no total-stable ordering guarantee beyond the sort key    | `api/src/server.ts:81-110`, `shared/models.ts:250-254` |
| Stale response guard   | Monotonic `request` counter; late callbacks dropped                                                                                                                                                                                                | `library.ts:156,244,251-264`                           |
| Caching                | SWR per user, `FRESH_MS=60s`, in-flight dedupe, typed searches not persisted, `invalidate` bumps a `version` signal                                                                                                                                | `web/src/api.ts:52-61`, `web/src/data-cache.ts:5-50`   |
| Prefetch               | None. No page N+1 request exists                                                                                                                                                                                                                   | grep: no `prefetch` in `web/src`                       |
| Queue "pagination"     | None server-side. `GET /recommendations` returns the whole queue; the client slices `visible()` (30, +30 per "load more")                                                                                                                          | `queue.ts:488-490,526,533`, `server.ts:140-146`        |
| Queue filter           | Client-side text search over the full queue; drag is disabled while searching                                                                                                                                                                      | `queue.ts:527-541,733`                                 |
| Wishlist               | Full array (`GET /wishlist`), client-side sort (name/discount/price), no pagination                                                                                                                                                                | `wishlist.ts:313-319`, `wishlist-api.ts:17-20`         |
| Drag and drop          | Hand-written pointer/keyboard engine: long-press, handle, edge autoscroll, PageUp/PageDown +/-5, Escape cancel, reduced-motion path, `aria-describedby="reorder-help"`, live-region announcements. It operates on the unfiltered, full-length list | `queue.ts:34,296-330,733-760,832-1100`                 |
| Reorder commit         | Optimistic splice, then `POST /queue/reorder {gameId,toPosition}`; sends serialized (`this.sending` chain); on any failure reload from server; quiet refresh 1200 ms after the last send                                                           | `queue.ts:1020-1050,1110-1150`, `api.ts:96-103`        |
| Other UI               | `metadata-select` is a single-purpose multi-select, no collection logic; `detail.ts` is a page, not a list                                                                                                                                         | `metadata-select.ts:200`, `detail.ts`                  |

Not verified: virtualization need (no measurement exists); grid/list mode toggle (Library shows cards only).

## 3. Reorder intent versus API invariants

- Drag emits only `ReorderIntent { itemId, fromIndex, toIndex }` (zero-based, in the full ordered list). The adapter converts to `toPosition = toIndex + 1`.
- API contract: `toPosition` integer in `[1, 100000]` (`service.ts:244-249`); then `planMove` requires `1..queue length` and the game to be in the queue (`scoring.ts:520-526`, `service.ts:273-283`). Errors: 404 unknown game, 409 manual adjustment disabled or game not in queue, 400 range.
- `planMove` converts the new order into pins: the moved game plus any already-pinned game whose position shifted (`scoring.ts:528-533`). Pins are then re-inserted by `recommendGames` with clamping and prerequisite interactions (`scoring.ts:362,409-412`, `pinnedBeforePrerequisite`). Therefore the final order can differ from the dropped order. The UI must treat the drop as a hint and reconcile with the server queue (today: `settle()` / `refreshQuietly`).
- `200 accepted` means validated, not persisted (`server.ts:148-153`, `runInBackground`). The kit exposes the states `idle | optimistic | accepted | confirmed | failed`; "confirmed" is reached only by a refetch showing the item at the expected position or an explicit server signal (Plan 01 decision).
- Reorder is only valid on a complete, unfiltered, queue-sorted list. Offset pagination of a reorderable list is unsound (positions shift); the Queue stays fully loaded (client slice) unless the owner approves a cursor design. The kit's `reorderable` flag is therefore mutually exclusive with `filters` active and with remote pagination.
- Serialization of concurrent moves (`sending` chain) and server `serial()` ordering (`service.ts:220`) must be kept; a mutation hook must queue, not parallelize.

## 4. DataCollection contract (sketch, no product types)

```ts
type Page<T> = {
  items: T[];
  total?: number;
  nextCursor?: string | null;
  page?: number;
  pageSize?: number;
};
type CollectionQuery<F> = {
  filters: F;
  sort: string;
  page: number;
  pageSize: number;
  cursor?: string;
};
type CollectionState = 'loading' | 'ready' | 'refreshing' | 'empty' | 'error' | 'offline';

interface PrefetchPolicy {
  ahead: number; // default 0; Checkpoint Library: 2
  maxConcurrent: number; // default 1
  idleOnly: boolean; // wait for requestIdleCallback
  respectSaveData: boolean; // skip if navigator.connection.saveData or effectiveType 2g/slow-2g
  staleTimeMs: number; // default 60_000 (matches FRESH_MS)
}

interface DataCollectionProps<T, F> {
  queryKey: readonly unknown[]; // must include user identity (Plan 02/03)
  fetchPage: (q: CollectionQuery<F>, signal: AbortSignal) => Promise<Page<T>>;
  getId: (item: T) => string;
  filters: F;
  onFiltersChange: (f: F) => void; // serializable; mirrored to URL
  sort: string;
  pageSize: number;
  pagination: 'page' | 'cursor' | 'none';
  prefetch?: PrefetchPolicy;
  view: 'list' | 'cards';
  renderItem: (item: T, ctx: { view: 'list' | 'cards'; index: number }) => ReactNode;
  selection?: 'none' | 'single' | 'multiple';
  reorder?: {
    onIntent: (i: ReorderIntent) => Promise<void> | void;
    announce?: (msg: string) => void;
  };
  slots?: {
    empty?: ReactNode;
    error?: (e: unknown, retry: () => void) => ReactNode;
    offline?: ReactNode;
    skeleton?: ReactNode;
  };
}
```

Rules: no import of game/queue/wishlist modules (enforced by lint, see task 9); the kit never calls Ky or TanStack Query directly except through a thin `useCollectionQuery` adapter inside the app (kit receives `fetchPage`); search input debounce is 250 ms by default (parity).

## 5. Prefetch policy design

- Trigger: after page N reached `ready`, and idle. Prefetch `N+1..N+ahead` while `page + k <= ceil(total / pageSize)`; with cursor mode, only follow `nextCursor` sequentially (N+2 requires N+1 result).
- Implementation basis: TanStack Query `prefetchQuery` per page key `[...queryKey, filters, sort, pageSize, page]`, `staleTime = policy.staleTimeMs`. Do not use `maxPages`/infinite queries as the prefetch mechanism (analysis §8.2 note).
- Cancel: pass `AbortSignal`; cancel queued prefetches on filter, sort, pageSize, identity or `view` data change (`cancelQueries` on the old key prefix). Sign-out clears the cache (parity with `clearDataCache`).
- Never prefetch typed search results (`q` non-empty), parity with `api.ts:59`; never block current page; failures are silent (no error state).
- Budget: at most `ahead` extra requests per page change, `maxConcurrent=1`; dedupe via Query. Count prefetch requests in Plan 05 metrics.
- Server cost caveat: the API recomputes the whole catalog per request, so each prefetch costs a full `service.all()`. Prefetch ahead=2 triples list load for Library until the API filters in SQL or caches; start with `ahead: 1` behind a flag, then measure.

## 6. Ordered tasks

1. Baseline measure on current Angular Library (requests per page change, p95 `/games`, payload size, render time with 24/100 items). Needed for the virtualization and prefetch decisions.
2. Write ADR for the contract in section 4 and the reorder state machine in section 3 (with owner decisions below).
3. After Plan 03 delivers the Library screen: implement `useCollectionQuery` (page mode, abort, stale guard, URL-synced filters) inside the app, unextracted.
4. Add prefetch hook with the policy; tests in section 8; ship `ahead:1` behind a flag.
5. Build `Pagination`, `SearchField`, `EmptyState`, `ErrorState`, `FilterBar` from Library needs only.
6. Port Wishlist onto the same primitives (client-side `pagination:'none'`, sort local) to validate non-remote mode and list/cards toggle.
7. Queue: integrate dnd-kit (Pointer, Touch, Keyboard sensors; custom keyboard coordinates to preserve PageUp/PageDown +/-5, Escape cancel, announcements) as the `reorder` slot; map to section 3. Keep the optimistic/serialized/rollback logic in the Queue feature, not the kit.
8. Forms: React Hook Form + Zod for Settings/manual game forms only when ported (Plan 03 order); `metadata-select` becomes a kit `MultiSelect` only if a second consumer appears.
9. Enforce boundaries: `packages`-style folder `web/src/ui/` with ESLint `no-restricted-imports` (ui may not import `features/*`, `api/*`); Tailwind tokens + shadcn primitives copied into `ui/`.
10. Extract/stabilize the API only after tasks 3-7 pass; virtualization only if task 1 shows > ~200 mounted rows is slow.

## 7. Acceptance criteria

- Library on React matches today: 24/page, same filters/sort, 250 ms debounce, page reset on filter change, stale responses ignored, SWR show-then-revalidate, no flash of empty on page switch.
- With `ahead:2` and 3 pages available, going to page 1 issues at most requests for pages 2 and 3 after idle, none when `saveData`, none beyond last page, none for non-empty `q`, all aborted on filter change.
- Queue drag works with mouse, touch (long-press/handle), and keyboard only; `prefers-reduced-motion` disables animation; each move is announced; focus returns to the handle.
- Failed reorder restores the server order and shows the message; two quick moves are sent in order and end consistent with the server.
- `ui/` has zero imports from feature code (lint passes). axe: no serious violations on Library, Queue, Wishlist; visible focus; contrast AA.

## 8. Tests

- Unit (Vitest): prefetch scheduler (bounds, cancel, saveData, cursor sequencing), intent-to-`toPosition` mapping, reorder state machine.
- Component (Testing Library + MSW): states loading/empty/error/offline, filter reset, debounce, stale response race, view toggle keeps filters/page.
- Playwright: Library paging with network assertions; Queue keyboard move, touch move, forced 409/500 rollback; reduced motion.
- Contract (Plan 06): `GamePage` and `ReorderAccepted` schemas; API reorder range tests already imply 400/404/409.
- axe-core in Playwright for the three screens.

## 9. Risks

- Reproducing the custom drag engine's polish (autoscroll, placeholder slots, long-press) with dnd-kit; regressions on iOS touch scrolling.
- Final queue order differs from dropped order (pins, prerequisites): visual jump after reconcile.
- Prefetch multiplies full-catalog recomputation; may degrade the single-process API.
- Offset pagination plus concurrent edits (playing status changes) can duplicate/skip items across pages.
- Premature abstraction: kit shaped by one screen. Mitigation: extraction gate in task 10.

## 10. Dependencies on other plans

- 01: standardized error shape (`code`, `requestId`) feeds `ErrorState` and the rollback message (today read from `error.error.message`, `queue.ts:1121`); decision on "accepted vs persisted" signal; optional server-side filtering/cursor endpoint; payload limits.
- 02: query keys include user id; no cross-user cache; 401/403 behavior in `fetchPage`; `PermissionGate` deferred.
- 03: hosts all code; Ky/Query retry ownership (prefetch and mutations must not double-retry; reorder is a non-retried mutation on the client, server already retries persistence); router chosen for URL-synced filters. Conflict: Plan 03 lists "optimistic reorder" under Query; this plan keeps it in the Queue feature using Query mutation primitives, with the kit only emitting intent.
- 05: metrics for prefetch count, drag failure rate, list latency.
- 06: Vitest/MSW/Playwright stack, contract tests, axe in CI.

## 11. Open decisions for the owner

1. Should the Queue ever paginate (cursor on server) or stay fully loaded with client slice? (affects reorder across pages)
2. Prefetch default: `ahead: 2` as requested, or `1` until the API stops recomputing the catalog per request?
3. Add server-side pagination for Wishlist/Queue, or keep client-side?
4. Does "confirmed" need a server signal (job id / version) or is refetch-and-compare enough?
5. Is Library list mode (versus cards only) a real requirement now?
6. URL-synced filters for Library and Queue search: yes or no?
7. Accept shadcn/Tailwind restyle of the existing `styles.css` (2021 lines) or keep visual parity first?
