---
id: architecture.frontend.queue
title: Queue interactions
type: component
area: frontend
status: active
owner: unknown
last_verified: 2026-10-12
source_paths:
  - web/src/finish-dialog.ts
  - web/src/styles.css
  - web/src/lists.ts
  - web/src/queue.ts
  - web/src/api.ts
  - web/src/immediate.ts
  - shared/models.ts
related_domains:
  - domain.prioritization
tags: [angular, frontend]
---

# Queue interactions

## 1. Purpose

Render recommendations and support accessible manual ordering with optimistic interaction and canonical reconciliation.

## 2. Scope and ownership

Includes client search, paging, pointer/touch/keyboard drag, immediate desire controls, pins and manual reset. Scoring, pin invariants and durable writes are server-owned.

## 3. Architecture map

| Responsibility        | Location               | Detail                                             |
| --------------------- | ---------------------- | -------------------------------------------------- |
| Rendering/search/drag | `web/src/queue.ts`     | `Queue`                                            |
| Network/cache         | `web/src/api.ts`       | `queue`, `reorder`, `rememberQueue`, `resetManual` |
| Desire shortcut       | `web/src/immediate.ts` | `ImmediateButton`                                  |

## 4. Contracts and behavior

Queue follows `/ordem/:listId`, shows cached recommendations then revalidates, and displays 30 rows per expansion. Search matches all folded query words against name, genre, tags, mechanic and pace; it preserves original positions and disables drag. Fresh network responses reconcile settings configVersion. A user recalculation or error recovery can force a network read.

Drag supports pointer capture, 320ms touch long press, keyboard pickup/move/drop/cancel, announcements, reduced motion, scrolling and FLIP animation. Drop reorders locally and remembers the optimistic queue in DataCache. Requests POST `/lists/{id}/queue/reorder` serially with gameId/toPosition. Acceptance completes the HTTP request before durable background work; after submissions settle, a 1200ms delayed forced reread reconciles scores/order. Request failures force reload; busy interactions defer reconciliation by 800ms. Reset DELETEs `/queue/adjustments/{gameId}` and uses returned Recommendations.

Queue and detail share [the finish dialog](library-and-game-detail.md). Successful completion invalidates game-dependent reads and forces queue reload; the server removes completed games from eligibility. At widths up to 600px rows show a cover, original position, name, immediate-desire action, and finish action; pinned rows expose an unpin icon. Metadata, score, hour columns, and desktop pin chips are hidden while drag and canonical reconciliation remain active. Mobile summaries and the next-game card are compact. List actions use the shared picker menu.

Immediate desire changes optimistically move an unpinned item after existing immediate/pinned entries; saved forces an animated canonical reread.

## 5. Invariants

Filtered search never renumbers the canonical queue. Updates from another list or during drag/pending moves are ignored. Manual pin status and prerequisite warnings come from server QueueEntry fields. Reorder acceptance is not a durable-save receipt.

## 6. Dependencies

Depends on Api, ScoringSettingsStore, ListPicker/routeListId, browser layout/pointer/animation APIs and shared Recommendations/QueueEntry/ReorderAccepted contracts.

## 7. Data and state

Signals own displayed queue, visible count, query, errors, announcements and busy IDs. Private drag state owns measured DOM geometry. A promise chain preserves submission order. DestroyRef cleans host/window listeners, pending drag, flash and refresh timers. Browser cache can contain an optimistic queue until forced server reconciliation.

## 8. Source references

`Queue.shown`, `load`, `setDesire`, `drop`, `save`, `settle`, `refreshQuietly`, `resetManual`, `flipTo`; `Api.rememberQueue`, `reorder`; `shared/models.ts`: `QueueEntry`, `ReorderAccepted`, `ManualResetResult`.

## 9. Related documentation

[Frontend root](../front-end-architecture.md), [Lists and settings](lists-and-scoring-settings.md), [Library/detail](library-and-game-detail.md), [Backend](../back-end-architecture.md), [Cache](../cache-architecture.md), [Prioritization domain](../domains/prioritization/domain.md).

## 10. Evidence and uncertainties

VERIFIED from inspected source; API manual/list tests support route contracts but do not exercise drag UI. UNKNOWN: browser accessibility behavior and background write completion under slow infrastructure. A fixed reconciliation delay may observe server state before background processing finishes.
