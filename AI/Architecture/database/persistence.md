---
id: architecture.database.persistence
title: Persistence and data ownership
type: module
area: database
status: active
owner: unknown
last_verified: 2026-10-11
source_paths:
  - api/src/releases.ts
  - db/migrations/015_release_log.sql
  - api/src/setup.ts
  - api/src/db.ts
  - api/src/pg-repository.ts
  - api/src/wishlist-repository.ts
  - db/migrations/001_init.sql
  - db/migrations/011_game_lists.sql
  - db/migrations/014_steam_price.sql
related_domains:
  - domain.game-library
  - domain.prioritization
  - domain.wishlist
tags: [postgres, json, ownership]
---

# Persistence and data ownership

## 1. Purpose

Explain current storage ownership, repository writes and database consistency mechanisms.

## 2. Scope and ownership

Owns PostgreSQL and local JSON variants. This document describes declared schema and executable queries, rather than claiming the migrations have run in a hosted environment.

## 3. Architecture map

| Responsibility                  | Location                            | Detail                                                  |
| ------------------------------- | ----------------------------------- | ------------------------------------------------------- |
| Global catalogue and vocabulary | `db/migrations/001_init.sql`        | `game`, `genre`, `mechanic`, `tag`, `store`, `game_tag` |
| Global metadata and media       | `db/migrations/001_init.sql`        | `game_metadata`, screenshots, trailers, sources         |
| Personal library                | `db/migrations/001_init.sql`        | `app_user`, `library_entry`                             |
| List configuration and pins     | `db/migrations/011_game_lists.sql`  | `game_list`, settings, adjustments, move events         |
| Latest Steam prices             | `db/migrations/014_steam_price.sql` | `game_price`                                            |
| SQL implementation              | `api/src/pg-repository.ts`          | Game, list, scoring, pin and queue-input repositories   |

## 4. Contracts and behavior

`PgGameRepository.save` uses a writable CTE to update global catalogue fields, the owner library row and normalized tags. The target requires a game in that owner library, but catalogue edits affect everyone sharing the game. `PgManualAdjustmentRepository.pin` records an event and changed pins using a CTE; duplicate client request IDs are no-ops. `PgWishlistStore.create` uses `sql.begin` for catalogue/library/metadata creation. Database errors become application errors in repository code.

## 5. Invariants

`library_entry` is unique per `(user_id, game_id)`. Composite `(user_id, list_id)` foreign keys require list ownership to match settings, pins and move events. List names are unique per user ignoring case. The API preserves at least one list; this is not a database deletion trigger. Steam app IDs are intentionally nonunique in `game`, accommodating collections.

## 6. Dependencies

`createService` constructs repository variants. PostgreSQL repositories depend on [identity resolution](../security/authentication-and-ownership.md). Business scoring reads repository inputs and computes in TypeScript. Security rules are in [database access](../security/database-access.md).

## 7. Data and state

Catalogue metadata/tags are normalized and propagated by triggers to card fields and personal search fields. Generated columns include normalized keys, estimates and queue eligibility. `trg_library_entry_fill` increments `version` for personal field changes, excluding propagated catalogue/scoring output changes. HTTP PATCH does not enforce If-Match/ETag despite schema comments. Settings upserts increment `version` atomically. Prices retain one current row per Steam app/country, without history.

Indexes include user-prefixed B-tree sorting/filtering, composite GIN tags/search, catalogue trigram search, queue/wishlist partial indexes and foreign-key lookup indexes. Their actual hosted usage has not been measured.

`app_release` stores immutable registration metadata, with unique environment/version and a partial unique environment/SHA index excluding rollbacks. Hashes are full lowercase SHA-1 values. `app_release_deploy` appends build evidence and deduplicates non-null deployment IDs. Composite foreign keys require its release ID, SHA, and environment to match one registration and require rollback targets to belong to the same environment. A rollback references an existing release but has its own new version and may have a new revert commit. UPDATE, DELETE, and TRUNCATE triggers reject ordinary SQL mutation of both release tables. Latest registration and latest associated build are selected by descending IDs; neither proves traffic promotion. [Migration 015](migrations.md) resets legacy release metadata once before installing these controls.

`db` uses a singleton postgres.js pool, `prepare: false`, default maximum five connections, 20-second idle timeout, ten-second connection timeout and 30-minute lifetime. Without a database, `createService` selects JSON files; those repository instances are not partitioned by authenticated user in setup. Vercel defaults those files to temporary instance storage.

## 8. Source references

`api/src/db.ts#db`; `api/src/setup.ts#createService`; `api/src/pg-repository.ts#PgGameRepository.save`, `PgManualAdjustmentRepository.pin`, `PgScoringConfigRepository.save`, `PgListRepository.remove`; `api/src/wishlist-repository.ts#PgWishlistStore.create`; `db/migrations/001_init.sql#trg_library_entry_fill`, `trg_game_propagate`; `db/migrations/011_game_lists.sql`; `db/migrations/014_steam_price.sql`.

## 9. Related documentation

[Database root](../database-architecture.md), [migrations](migrations.md), [game library](../domains/game-library/domain.md), [prioritization](../domains/prioritization/domain.md), [wishlist](../domains/wishlist/domain.md).

## 10. Evidence and uncertainties

VERIFIED: declared ownership, indexes, trigger behavior and repository statements. UNKNOWN: hosted schema, runtime role, backup/retention policy and performance under real workloads. Catalogue edits have no observed curator-role check. JSON fallback does not implement PostgreSQL owner partitioning. No current snapshot tables should be inferred from the obsolete ER diagram in `db/README.md`.
