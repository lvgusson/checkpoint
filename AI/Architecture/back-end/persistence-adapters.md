---
id: architecture.backend.adapters
title: Repository ports and adapters
type: module
area: backend
status: active
owner: unknown
last_verified: 2026-10-12
source_paths:
  - api/src/releases.ts
  - api/src/setup.ts
  - api/src/repository.ts
  - api/src/pg-repository.ts
  - api/src/list-repository.ts
  - api/src/manual-repository.ts
  - api/src/settings-repository.ts
  - api/src/wishlist-repository.ts
related_domains: [domain.game-library, domain.prioritization, domain.wishlist]
tags: [backend]
---

# Repository ports and adapters

## 1. Purpose

Map service repository interfaces to JSON and PostgreSQL implementations.

## 2. Scope and ownership

Owns application-facing adapter contracts. [Database persistence](../database/persistence.md) owns schema, SQL relationships and storage details.

## 3. Architecture map

| Port                       | Local implementation            | PostgreSQL implementation    |
| -------------------------- | ------------------------------- | ---------------------------- |
| GameRepository             | LocalGameRepository             | PgGameRepository             |
| ListRepository             | LocalListRepository             | PgListRepository             |
| ManualAdjustmentRepository | LocalManualAdjustmentRepository | PgManualAdjustmentRepository |
| ScoringConfigRepository    | LocalScoringConfigRepository    | PgScoringConfigRepository    |
| QueueInputsReader          | None                            | PgQueueInputsReader          |
| ReleaseStore               | MemoryReleaseStore (tests)      | PgReleaseStore               |
| WishlistStore              | LocalWishlistStore              | PgWishlistStore              |

## 4. Contracts and behavior

createService imports adapters on demand. Local games merge persisted rows over a seed snapshot; app-created games are included. Local old unscoped settings/pins migrate in memory to LOCAL_DEFAULT_LIST_ID. Stored scoring values are tolerated through default substitution. PgQueueInputsReader loads list, entire owner library, pins and settings in one SQL statement.

## 5. Invariants

Local reads clone mutable game/list/settings data. JSON files use temporary-file rename, without cross-process locking. Pg operations enforce identity through the resolver and query predicates/constraints.

## 6. Dependencies

Pg adapters depend on Sql and AppUserResolver. Local adapters depend on filesystem promises. Both serve GameService; WishlistStore supplements GameRepository with acquisition and prices.

## 7. Data and state

Game/manual/wishlist local writes have Promise serialization; list/settings local writes do not. Memory may change before disk write succeeds. Local list removal leaves its separate settings/manual records; Pg list deletion cascades. Local move deduplication is limited by retained history.

## 8. Source references

`api/src/setup.ts`: createService; `api/src/pg-repository.ts`: PgQueueInputsReader/PgManualAdjustmentRepository; local adapter classes in listed files.

## 9. Related documentation

[Backend root](../back-end-architecture.md), [database](../database-architecture.md), [identity](../domains/identity/domain.md), [background ordering](background-reordering.md).

## 10. Evidence and uncertainties

VERIFIED adapter differences. These local adapters are development/test storage, not a multi-process transactional store. UNKNOWN: applied hosted schema.
