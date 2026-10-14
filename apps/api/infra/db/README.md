# Checkpoint PostgreSQL and Supabase persistence

Current schema ownership, executable repository behavior, and access controls are documented in [database persistence](../AI/Architecture/database/persistence.md), [migration compatibility](../AI/Architecture/database/migrations.md), and [database access](../AI/Architecture/security/database-access.md).

Apply numbered migrations in order, or their timestamped Supabase counterparts using the configured migration runner. Do not apply both histories to one database. Supabase also has an environment-specific hardening migration; earlier numbered sources alone do not establish its permissions. Enum additions must commit before later migrations use their new values.

Migration 008 removes historical queue snapshots and invalidation state. The API computes recommendations from current inputs; list-specific manual pins and events are persisted by current repositories. Local JSON storage is a development alternative with different consistency and ownership guarantees.

Migration 015 and its timestamped copy intentionally truncate only app_release_deploy and app_release, restart their identities, and install full lowercase SHA constraints, unique registrations, matching deployment foreign keys, RLS, revoked client grants, and UPDATE/DELETE/TRUNCATE rejection triggers. No application owners, games, library entries, lists, or queue history are reset. Legacy duplicate commit hashes are discarded rather than converted. Apply it once; its reset cannot be repeated after append-only enforcement. Privileged administrators can still alter schema or disable triggers.

Release registration starts at 0.0.1 per environment. Latest registration and build evidence are distinct and do not prove which deployment serves traffic. Old release scripts that depend on removed status or deployment columns are incompatible after migration.

```bash
node db/seed/import.mjs
node db/seed/import.mjs --force
```

The normal seed generator preserves existing catalogue/library edits; force mode intentionally replaces seed-owned fields. Review generated SQL and the selected owner before applying it. Hosted migration state, actual connection roles, and backups require separate verification.
