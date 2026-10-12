---
id: architecture.infrastructure.delivery
title: Deployment and release operations
type: integration
area: infrastructure
status: active
owner: unknown
last_verified: 2026-10-11
source_paths:
  - api/src/releases.ts
  - scripts/release-note.mjs
  - scripts/master-user.mjs
  - db/migrations/015_release_log.sql
  - vercel.json
  - api/index.mjs
  - api/src/setup.ts
  - api/src/db.ts
  - api/src/version.ts
  - scripts/record-release.mjs
  - scripts/release-lib.mjs
  - scripts/rollback.mjs
  - package.json
  - .gitignore
  - .vercelignore
related_domains: []
tags: [deployment, rollback, configuration]
---

# Deployment and release operations

## 1. Purpose

Explain application packaging, release evidence and rollback limitations.

## 2. Scope and ownership

Owns source-controlled deployment behavior. Separate database documentation owns migrations; coordinator-owned harness documents describe the new review hooks.

## 3. Architecture map

| Responsibility          | Source                                            | Behavior                                          |
| ----------------------- | ------------------------------------------------- | ------------------------------------------------- |
| Static bundle           | `vercel.json`, `package.json`                     | Angular output `dist/web/browser`                 |
| API function            | `api/index.mjs`                                   | Reuses makeServer request listener                |
| Release recording       | `scripts/record-release.mjs`                      | Best-effort build-time database record            |
| Version endpoint        | `api/src/version.ts`                              | Database lookup with environment/package fallback |
| Rollback plan/execution | `scripts/rollback.mjs`, `scripts/release-lib.mjs` | Dry run by default                                |

## 4. Contracts and behavior

Vercel routes `/api/*` to a single `api/index.mjs` Node function, existing static files through filesystem handling and other paths to index.html. The function imports TypeScript implementation directly and forwards requests to the HTTP server listener. Included files cover API sources, shared sources, OpenAPI and package metadata. Config specifies pdx1; package engines require Node >=24.15.0.

`vercel-build` runs Angular build then record-release. The record script uses Vercel Git/deployment environment metadata and the maximum Supabase migration ledger version. ensureRelease reuses the newest registration matching the exact lowercase full SHA and environment, including a rollback; otherwise it registers an automatic chore release using the first commit-message line and default patch increment. Build evidence is appended separately and duplicate deployment IDs are ignored. Errors and the 30-second timeout do not fail the build; record registration or build evidence does not prove successful deployment or traffic promotion.

Rollback resolves an existing registered release by deployment, URL, unambiguous SHA prefix, or version. Without --yes it prints a plan. With --yes it invokes Vercel rollback or creates Git revert commits followed by push; Git mode checks a clean working tree and target ancestry. Every executed rollback appends a new rollback registration linked to that target: Vercel mode records the target SHA, Git mode records the new revert HEAD before push. The subsequent Git build reuses that rollback registration. A commit absent from the registration log is not a rollback target. External commands and database registration are not one transaction; a command can succeed before a failed metadata write. Migration reversal is manual, and release tags are separate operations.

## 5. Invariants

Latest means the latest registration (highest ID), including rollback; it does not identify which deployment currently serves traffic. Rollback must account for older code running on the current database schema. JSON fallback is temporary and per serverless instance. Credentials must not appear in committed source, architecture documents or archive entries.

### Release registration policy

MANDATORY: every push to `main` MUST publish a new release record with `POST /api/v1/releases` (Bearer `RELEASE_API_TOKEN`) or `npm run release:note -- "<description>" [--kind fix|feature|refactor|chore|release] [--bump minor|major]`. The record carries the pushed commit hash, SemVer version, optional name, `kind` and a short description of what the push delivers.

- Versioning: each push increments the patch automatically (0.0.1, 0.0.2, …). Use `--bump minor` or `--bump major` only when the user explicitly asks; 1.0.0 is reserved for a real product launch.
- The release table is append-only: only `GET /api/v1/releases`, `GET /api/v1/releases/latest` and `POST /api/v1/releases` exist. Never add PATCH/DELETE or UPDATE/DELETE statements against it.
- A rollback is a new record with `kind: rollback`; it never modifies earlier records.

VERIFIED: the integrated release API and scripts append registrations and deployment evidence. Rollback kind is created by the rollback script, rather than accepted by release POST. API SHA input requires 40 hexadecimal characters and normalizes uppercase. release:note resolves --sha (including local references and abbreviations) through git rev-parse --verify before posting. Ordinary registration is idempotent by exact commit/environment; concurrent version conflicts retry allocation and duplicate commit conflicts return created=false. Explicit rollback events are always new registrations.

## 6. Dependencies

API storage selection depends on DATABASE_URL; identity depends on SUPABASE_URL and public key configuration. Direct SQL uses postgres.js with prepared statements disabled. Intended transaction-pooler topology is described by repository documentation, but actual endpoint/role is unknown. External Steam/Auth availability affects application operations.

## 7. Data and state

`currentVersion` prefers the current deployment database record, then package version/environment SHA or local Git; deployed database results are cached per instance. Vercel fallback results remain uncached so a delayed release record can later be found. app_release retains registration and rollback relationships; app_release_deploy owns immutable build evidence. package.json version 0.0.0 is only the fallback version, not the release counter.

Environment names consumed include DATABASE_URL, DATABASE_URL_SESSION, SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY/SUPABASE_ANON_KEY, SEED_OWNER_EMAIL, RELEASE_API_TOKEN, RELEASE_API_URL, PG_POOL_MAX and Vercel system variables. Values were not read. Git/build ignore files exclude local environment files, deployment state and mutable API data. Husky retains lint-staged and commitlint and invokes architecture gates; the checked-in architecture workflow performs deterministic CI validation. Remote enforcement is not established by its presence.

The administrative master:create script requires SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_PUBLISHABLE_KEY, and DATABASE_URL. It creates or finds the configured email (default master@gps.dev.br), confirms email, and sets an existing MASTER_PASSWORD or a generated password. Credentials are written only to ignored local-env.env. In a database transaction it inserts an ordinary app_user and copies missing library entries from the fixed seed owner; --reset deletes only that account's lists and library first. It shares existing catalogue games and does not grant application administrator privileges. A password-login request checks provisioning after persistence. User-editable username metadata is descriptive, not an authorization claim.

## 8. Source references

`vercel.json`; `api/index.mjs#handler`; `api/src/setup.ts#createService`; `api/src/db.ts#db`; `api/src/version.ts#currentVersion`; `scripts/record-release.mjs#main`; `scripts/release-lib.mjs#resolveTarget`, `gitRollbackCommands`, `migrationWarning`; `scripts/rollback.mjs#rollback`; `.gitignore`; `.vercelignore`.

## 9. Related documentation

[Infrastructure root](../infrastructure-architecture.md), [database migrations](../database/migrations.md), [persistence](../database/persistence.md), [security root](../security-architecture.md).

## 10. Evidence and uncertainties

VERIFIED: source/configuration, the configured database connection, and four legacy release rows. The new migration passed fifteen PostgreSQL checks inside a transaction that was deliberately rolled back; legacy rows remained intact. The new migration has not been installed and no release has been published by this task. UNKNOWN: remote project configuration, automatic Git deployment connection, successful served release, hosted monitoring/backups and rollback readiness. Existing docs/deploy.md describes apply_queue_move-based reordering, while current PgManualAdjustmentRepository.pin uses CTE statements. Do not treat supporting prose as proof of current executable behavior.
