---
id: architecture.database.migrations
title: Migrations and schema compatibility
type: component
area: database
status: active
owner: unknown
last_verified: 2026-10-11
source_paths:
  - db/migrations
  - supabase/migrations
  - supabase/config.toml
  - db/seed/import.mjs
  - scripts/release-lib.mjs
related_domains:
  - domain.game-library
  - domain.prioritization
  - domain.wishlist
tags: [migrations, compatibility]
---

# Migrations and schema compatibility

## 1. Purpose

Explain the two checked-in migration histories and compatibility constraints.

## 2. Scope and ownership

Owns schema evolution and seed inputs. Application deployment rollback is described separately. This bootstrap does not execute migrations or rewrite existing migration files.

## 3. Architecture map

| Evolution             | Numbered source                                                       | Effect                                                                             |
| --------------------- | --------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Initial schema/RLS    | `001_init.sql`, `002_queue_snapshot.sql`, `003_rls.sql`               | Catalogue/library and original snapshots/access rules                              |
| Snapshot deletion fix | `004_fix_bump_on_user_delete.sql`                                     | Historical trigger repair                                                          |
| Release/settings      | `006_app_release.sql`, `007_scoring_settings.sql`                     | Release catalogue, settings rules/version                                          |
| Snapshot removal      | `008_drop_queue_snapshot.sql`                                         | Drops snapshot/state/view and invalidation functions/triggers                      |
| Pins and desire       | `009_queue_pins_desire_immediate.sql`, `010_ref_desire_immediate.sql` | Converts manual adjustments and adds immediate desire                              |
| Lists and filters     | `011_game_lists.sql`, `012_scoring_filters.sql`                       | Per-list ownership/configuration and filter JSON                                   |
| Append-only releases  | `015_release_log.sql`                                                 | Release-only legacy reset, full hashes, immutable registrations and build evidence |
| Wishlist and price    | `013_wishlist_status.sql`, `014_steam_price.sql`                      | Wishlist enum/label, latest Steam price                                            |

All numbered paths above are under `db/migrations/`; corresponding timestamped files are under `supabase/migrations/`.

## 4. Contracts and behavior

The first three Supabase copies omit explicit BEGIN/COMMIT because the migration runner owns the transaction. Comparison found only those removals and explanatory comments. Mirrored files for 004 and 006–015 have identical SHA256 hashes. `20261011154854_supabase_hardening.sql` is Supabase-only: fixed search paths, reduced grants and restricted function execution.

Migration 015 and its timestamped copy are byte-identical. The user authorized discarding legacy release records: the migration truncates only app_release_deploy and app_release with RESTART IDENTITY, without CASCADE, before append-only triggers exist. This prevents repeated legacy commit hashes from violating the new partial unique index and starts fresh registration at 0.0.1. It does not truncate owners, games, library entries, lists, or queue history. Apply this migration once; rerunning it after append-only enforcement fails. Old deployed code that updates app_release or expects removed columns is incompatible with this schema, so choose compatible rollback targets.

Local Supabase configuration uses imperative migrations (`schema_paths = []`) and `supabase/seed.sql`. `db/seed/import.mjs` generates seed SQL from application seed and optional metadata. Existing instructions describe normal inserts preserving catalogue/library edits unless force mode is chosen.

## 5. Invariants

Enum additions and reference-row insertions are separate migrations: immediate desire enters in 009, its reference row in 010; wishlist enters in 013, its reference row in 014. Preserve ordering. Migration 008 removes snapshots rather than merely leaving them unused. Historical migrations are evidence of evolution, not the current schema individually.

## 6. Dependencies

Supabase migration files mirror portable numbered sources with explicit environment exceptions. [Database access](../security/database-access.md) owns the resulting permission contracts. [Deployment operations](../infrastructure/deployment-and-release.md) depend on compatibility with the schema remaining after application rollback.

## 7. Data and state

Original migrations populate `schema_migration`; release recording inspects `supabase_migrations.schema_migrations`. These are distinct ledgers. Snapshot state and invalidation introduced in 002, including the repair in 004, are retired by 008. Existing manual points are converted to pin semantics by 009; per-user settings/adjustments/history are assigned to default lists in 011.

## 8. Source references

`db/migrations/008_drop_queue_snapshot.sql`; `db/migrations/009_queue_pins_desire_immediate.sql`; `db/migrations/011_game_lists.sql`; `supabase/migrations/20261011154854_supabase_hardening.sql`; `supabase/config.toml#[db.migrations]`; `db/seed/import.mjs`; `scripts/record-release.mjs#main`; `scripts/release-lib.mjs#migrationWarning`.

## 9. Related documentation

[Database root](../database-architecture.md), [persistence](persistence.md), [prioritization](../domains/prioritization/domain.md), [wishlist](../domains/wishlist/domain.md).

## 10. Evidence and uncertainties

VERIFIED through migration source comparison and a real PostgreSQL transaction that applied migration 015, tested fifteen release reset/constraint/access invariants, and rolled back. The original four release records remained intact. The new migration has not been installed. UNKNOWN: applied migrations, migration runner version, remote configuration and whether seed files were applied. `db/README.md` still describes removed snapshot structures, older keys and incomplete enums. Its broad idempotency statement is not a guarantee for every later ALTER migration. Application rollback never reverses migrations automatically.
