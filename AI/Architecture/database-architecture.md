---
id: architecture.database
title: Database architecture
type: architecture-root
area: database
status: active
owner: unknown
last_verified: 2026-10-11
source_paths:
  - api/src/setup.ts
  - api/src/db.ts
  - api/src/pg-repository.ts
  - db/migrations
  - supabase/migrations
related_domains:
  - domain.game-library
  - domain.prioritization
  - domain.wishlist
tags: [postgres, persistence]
---

# Database architecture

## 1. Purpose

Map the storage variants and ownership boundaries used by Checkpoint.

## 2. Scope and ownership

Owns persistence topology and schema navigation. Business scoring belongs to the prioritization domain; authentication and database access controls have separate security owners.

## 3. Architecture map

| Responsibility                     | Location                                       | Detail                                         |
| ---------------------------------- | ---------------------------------------------- | ---------------------------------------------- |
| Storage selection and repositories | `api/src/setup.ts`, `api/src/pg-repository.ts` | [Persistence](database/persistence.md)         |
| Ordered schema evolution           | `db/migrations/`, `supabase/migrations/`       | [Migrations](database/migrations.md)           |
| Row access and SQL trust           | `db/migrations/003_rls.sql`                    | [Database access](security/database-access.md) |

## 4. Contracts and behavior

VERIFIED: `createService` chooses PostgreSQL with `DATABASE_URL`, otherwise local JSON. PostgreSQL repositories return the existing public game model while translating database enum codes and relational keys.

## 5. Invariants

The global catalogue and personal library have distinct ownership. A list partitions scoring configuration and manual pins; it does not partition library membership.

## 6. Dependencies

Backend services call repositories. Repositories depend on the application-user resolver and PostgreSQL. Browser components call the API; the observed browser Supabase client manages authentication.

## 7. Data and state

See [persistence](database/persistence.md) for current tables, derived fields and atomic writes, and [migrations](database/migrations.md) for historical structures that were removed.

## 8. Source references

`api/src/setup.ts#createService`; `api/src/db.ts#db`; `api/src/pg-repository.ts#PgGameRepository`; migrations under `db/migrations/` and `supabase/migrations/`.

## 9. Related documentation

[Architecture index](architecture-index.md), [game library](domains/game-library/domain.md), [prioritization](domains/prioritization/domain.md), [wishlist](domains/wishlist/domain.md), [security](security-architecture.md), [infrastructure](infrastructure-architecture.md).

## 10. Evidence and uncertainties

VERIFIED from source and migration inspection. UNKNOWN: applied hosted migrations, actual database connection role and remote backups. No live database queries were executed. Existing database/deployment prose contains obsolete snapshot and reorder descriptions; current leaves identify the differences.
