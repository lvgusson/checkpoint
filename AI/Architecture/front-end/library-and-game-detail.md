---
id: architecture.frontend.library-detail
title: Library browsing and game detail
type: module
area: frontend
status: active
owner: unknown
last_verified: 2026-10-12
source_paths:
  - web/src/finish-dialog.ts
  - web/src/library.ts
  - web/src/detail.ts
  - web/src/api.ts
  - web/src/immediate.ts
  - shared/models.ts
related_domains:
  - domain.game-library
  - domain.prioritization
tags: [angular, frontend]
---

# Library browsing and game detail

## 1. Purpose

Present the game catalog, browse server-filtered results and submit game assessments.

## 2. Scope and ownership

Library and detail own drafts/loading/errors; shared ImmediateButton owns immediate-desire interactions. Server validation, scoring and completion transitions remain domain/backend responsibilities.

## 3. Architecture map

| Responsibility      | Location               | Detail                     |
| ------------------- | ---------------------- | -------------------------- |
| Catalog browsing    | `web/src/library.ts`   | `Library.load`, `search`   |
| Editing             | `web/src/detail.ts`    | `Detail.show`, `save`      |
| HTTP/cache contract | `web/src/api.ts`       | `Api.list`, `game`, `save` |
| Immediate desire    | `web/src/immediate.ts` | `ImmediateButton.toggle`   |

## 4. Contracts and behavior

Library uses `/catalog` and `/games` under `/api/v1`, 250ms search debounce, server name/score/desire sorting, filters and 24-item pages. Cached values display immediately; request counters reject superseded responses. Search-query result pages are memory-only cache entries.

Detail requests game/catalog concurrently. `show` updates canonical game data but replaces the draft only if the draft and comma-separated tags remain untouched. Save trims/deduplicates secondary tags (maximum three), builds a patch from changed allowed fields, normalizes empty dates/predecessor to null, and includes `autoFinish` only when rating changes. Successful writes replace the game cache and invalidate game-dependent caches.

`FinishDialog.open` mounts a shared native dialog from detail or queue. It requires a rating from 1 to 5 in half-point steps; played hours are optional, finite, and between 0 and 100000. Notes are trimmed and the finish date uses the local calendar day. Save PATCHes rating, hours, notes, explicit Finalizado status, and finishedAt through Api.save. Errors keep the dialog open. Successful detail completion rereads the game. At widths up to 640px the dialog is a bottom sheet with a downward drag dismissal; backdrop, Escape, and cancel also close it. Native dialog manages focus, and background overflow is restored on close.

ImmediateButton emits optimistic desire changes, persists through `Api.setDesire`, emits saved after success, and emits the original desire plus an error on failure. Toggle selects `Imediata` or the remembered previous desire; absent previous desire falls back to `Muito Alta`.

## 5. Invariants

The UI does not calculate canonical scores. Server responses remain the source for persisted game state. Revalidation preserves an edited detail draft. Immediate desire is a server game mutation and affects every list's recommendations.

## 6. Dependencies

FormsModule, RouterLink, ActivatedRoute, Api and shared Game/ScoredGame/Catalog/GamePage models. Rating/completion and prerequisite behavior require domain discovery before changes.

## 7. Data and state

Signals hold displayed results and error/loading state; mutable cloned fields hold the draft. DataCache stores reads and propagates mutation invalidation. Previous desire is stored by game ID under `checkpoint:previous-desire`, without user scope or logout removal.

## 8. Source references

`Library.load`, `search`, `setDesire`; `Detail.load`, `show`, `save`; `Api.save`, `setDesire`, `rememberDesire`, `previousDesire`; `ImmediateButton.toggle`; `shared/models.ts`: `Game`, `GameStatus`, `Desire`.

## 9. Related documentation

[Frontend root](../front-end-architecture.md), [Queue interactions](queue-interactions.md), [Cache](../cache-architecture.md), [Game-library domain](../domains/game-library/domain.md), [Prioritization](../domains/prioritization/domain.md).

## 10. Evidence and uncertainties

VERIFIED from current source. UNKNOWN: browser races under concurrent editing and live backend changes. Detail uses the route snapshot for its initial game ID; route reuse behavior was not exercised. Previous-desire storage is not per-user despite the general data cache being per-user.
