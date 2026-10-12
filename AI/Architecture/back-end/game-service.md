---
id: architecture.backend.service
title: Game and list orchestration
type: module
area: backend
status: active
owner: unknown
last_verified: 2026-10-12
source_paths:
  - api/src/service.ts
  - api/src/repository.ts
  - shared/models.ts
  - api/test/service.test.ts
  - api/test/lists.test.ts
related_domains: [domain.game-library, domain.prioritization]
tags: [backend]
---

# Game and list orchestration

## 1. Purpose

Explain service orchestration across library, list configuration and queue state.

## 2. Scope and ownership

GameService coordinates repository ports; scoring is delegated to pure functions. [Game lifecycle](../domains/game-library/domain.md) and [priority rules](../domains/prioritization/scoring-and-pins.md) own business details.

## 3. Architecture map

| Operation        | Symbol                                                   | Inputs                      |
| ---------------- | -------------------------------------------------------- | --------------------------- |
| Library edits    | patch                                                    | game ID, allowlisted fields |
| List lifecycle   | allLists/createList/renameList/deleteList                | name, optional ID           |
| Scoring settings | scoringSettings/saveScoringSettings/resetScoringSettings | list, config                |
| Queue            | recommendations/reorder/resetManual                      | list, game, position        |

## 4. Contracts and behavior

Explicit list IDs must be UUIDs and owned by the user; otherwise 404. Missing scope selects oldest list. Queue inputs use the optional combined reader; local mode reads games, pins and settings separately in parallel. Settings responses include defaults, factor metadata and filter counts. Catalog derives vocabulary/counts from all library games.

## 5. Invariants

List names trim and collapse whitespace, require 1..60 characters and reject duplicate names through adapters. Last-list deletion returns 409. A new changed rating may complete a game; completion removes pins across lists after saving.

## 6. Dependencies

Depends on GameRepository, ListRepository, ManualAdjustmentRepository, ScoringConfigRepository and optional QueueInputsReader. [Repositories](persistence-adapters.md) implement them. Context keys determine local ordering.

## 7. Data and state

Only queue recommendation/reorder/reset operations use the per-user Promise chain. Game edits and settings writes are outside it. Game save and completion pin cleanup are separate operations. Patch response is scored through the default list.

## 8. Source references

`api/src/service.ts`: GameService.inputs/list/patch/toSettings/serial; `api/src/repository.ts`: QueueInputsReader; api/test/service.test.ts and api/test/lists.test.ts.

## 9. Related documentation

[Backend root](../back-end-architecture.md), [background](background-reordering.md), [game library](../domains/game-library/domain.md), [prioritization](../domains/prioritization/domain.md), [cache](../cache/browser-data-cache.md).

## 10. Evidence and uncertainties

VERIFIED orchestration and validation. Partial completion cleanup is possible after a successful game save and later failure. UNKNOWN: frequency under real traffic.
