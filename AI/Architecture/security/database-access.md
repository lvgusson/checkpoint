---
id: architecture.security.database-access
title: Database access boundaries
type: component
area: security
status: active
owner: unknown
last_verified: 2026-10-11
source_paths:
  - db/migrations/015_release_log.sql
  - api/src/releases.ts
  - db/migrations/003_rls.sql
  - db/migrations/006_app_release.sql
  - db/migrations/011_game_lists.sql
  - db/migrations/014_steam_price.sql
  - supabase/migrations/20261011154854_supabase_hardening.sql
  - api/src/pg-repository.ts
related_domains:
  - domain.identity
  - domain.game-library
  - domain.prioritization
  - domain.wishlist
tags: [rls, grants, trust]
---

# Database access boundaries

## 1. Purpose

Distinguish direct SQL owner predicates from Supabase Data API permissions.

## 2. Scope and ownership

Owns declared database access controls and privileged function boundaries. It does not assert which SQL role the deployed API uses.

## 3. Architecture map

| Access path              | Evidence                            | Enforcement                                             |
| ------------------------ | ----------------------------------- | ------------------------------------------------------- |
| Node direct SQL          | `api/src/pg-repository.ts`          | Resolved app_user predicates and ownership foreign keys |
| Supabase Data API        | `db/migrations/003_rls.sql`         | Grants plus RLS policies                                |
| Supabase hardening       | Timestamped hardening migration     | Reduced grants and function execution/search paths      |
| Internal release records | `db/migrations/006_app_release.sql` | RLS without client policies, revoked grants             |

## 4. Contracts and behavior

Catalogue tables allow SELECT to anon/authenticated using true policies. Personal library/settings/pins use current_app_user_id for USING and WITH CHECK. app_user SELECT/UPDATE policies bind auth_user_id to auth.uid. game_list follows owner access; game_price follows public catalogue read access. queue_move_event grants SELECT/INSERT with owner checks; clients cannot UPDATE/DELETE through those permissions. Internal schema_migration, app_release, and app_release_deploy enable RLS without client policies. Migration 015 revokes release-table and identity-sequence privileges from PUBLIC, anon, and authenticated, and revokes execution of the append-only trigger function. Application storage needs a privileged direct SQL role able to SELECT and INSERT; table owners and BYPASSRLS roles can bypass RLS, but remain subject to ordinary UPDATE/DELETE/TRUNCATE triggers. Owners can disable triggers or alter schema, so these controls do not resist a malicious database administrator.

`library_card` is security_invoker on PostgreSQL 15+. `current_app_user_id` and `ensure_app_user` are SECURITY DEFINER with fixed search_path; ensure_app_user rejects null auth.uid. Some internal catalogue propagation helpers are also SECURITY DEFINER. Hardening reduces broad Supabase table/sequence grants, restricts ensure_app_user and queue mutation execution, and fixes additional search paths. The later list migration replaces queue function signatures and applies explicit execute permissions to them.

## 5. Invariants

Grants determine object access; RLS determines rows for roles subject to it. Direct connection alone does not bypass RLS: runtime privilege depends on the actual SQL role. Current direct SQL code does not switch to authenticated or set JWT claims, and it explicitly restricts personal operations by the application owner. List composite foreign keys prevent cross-owner list references.

## 6. Dependencies

Policies depend on auth.uid and application-user mapping. Direct repositories depend on [authentication and ownership](authentication-and-ownership.md). Schema exceptions and migration sequence are in [migrations](../database/migrations.md).

## 7. Data and state

App-user ownership is the personal-data boundary. Catalogue fields are shared. PgGameRepository.save selects a target through the current owner library but then updates global game/tag fields; no curator check was found. queue_move_event is append-only for client grants, while privileged administrative operations and list/user cascades can change its lifetime. RLS permissions do not make audit history globally immutable.

## 8. Source references

`db/migrations/003_rls.sql#current_app_user_id`, `ensure_app_user`, `app_user_self_update`; `db/migrations/001_init.sql#trg_game_propagate`; `db/migrations/006_app_release.sql`; `db/migrations/011_game_lists.sql#game_list_owner`; `db/migrations/014_steam_price.sql#game_price_read`; `supabase/migrations/20261011154854_supabase_hardening.sql`; `api/src/pg-repository.ts#PgGameRepository.save`.

## 9. Related documentation

[Security root](../security-architecture.md), [database root](../database-architecture.md), [identity domain](../domains/identity/domain.md), [game library](../domains/game-library/domain.md).

## 10. Evidence and uncertainties

VERIFIED declarations and executable predicates. UNKNOWN: actual deployed roles/BYPASSRLS, grants, exposed schemas and applied hardening. Numbered migration 003 alone does not include every Supabase-only grant reduction. A real PostgreSQL validation transaction confirmed release UPDATE, DELETE, and TRUNCATE rejection, anonymous read denial, authenticated insert denial, and RLS on both release tables; it was rolled back. Existing personal-data policies and advisors were not evaluated by this task.
