# Release Integration Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development for the implementation and independent review. Preserve all original worktrees and uncommitted work.

**Goal:** Consolidate the three pending features, the append-only release log, and the architecture harness into one independently consistent commit on main.

**Architecture:** Reuse the existing integrate tree and the unfinished release-log implementation. Registration and deployment evidence remain distinct; latest means the latest registered release. Every rollback creates a new release, and its subsequent build must reuse that record.

**Tech Stack:** Angular, Node.js, TypeScript, postgres.js, PostgreSQL/Supabase, Git, Husky.

**Spec:** The user's approved requirements in this conversation and AI/main-entry.md.

## Global Constraints

- Only GET and POST release endpoints; no PATCH, PUT, or DELETE operations.
- Releases and deployment evidence are append-only after migration.
- Start release numbering at 0.0.1 and increment patch by default; 1.0.0 requires an explicit product launch.
- Every rollback creates a new release; a build for that rollback reuses its registration.
- Store lowercase full 40-character Git SHA-1 hashes. Resolve local abbreviated references before sending; reject unresolved abbreviated API hashes.
- The user permits removing legacy release records during migration. Do not remove application games, owners, lists, or unrelated data.
- Latest means latest registration and does not prove which deployment serves traffic.
- Preserve existing pending work and historical archives. All new technical prose, comments, and identifiers use correct English.
- Every commit contains its implementation, current documentation, and exact obsolete documentation archives.
- Validate the index before committing; independent branch-review must pass before any push.
- No commit history rewriting, gate bypass, or production deployment inferred from local tests.

## Review Focus

- Full versus abbreviated or uppercase hashes: normalize local references; reject incomplete API input and use exact persistence identity.
- Rollback followed by a build: exactly one new rollback release, with the build attaching deployment evidence to it.
- Legacy release rows: clean reset only of release metadata before append-only enforcement, without duplicate-SHA migration failure.
- Concurrent registration: monotonic SemVer allocation and idempotent non-rollback registration.
- Integration: retain the account login, finish dialog, mobile queue, original dirty work, harness configuration, and documentation coverage together.

## Task 1: Consolidate and verify the release integration

**Files:** Existing integrate changes; the fifteen release-log files; affected AI architecture/domain leaves and exact archives; ownership.json; harness hooks; package manifests and lockfile.

**Interfaces:** Preserve the observed public application interfaces. Release HTTP accepts full gitSha, description, optional name/kind/environment/version or bump; POST requires the dedicated release token. Local scripts resolve Git references before calling shared release registration. PostgreSQL remains behind the existing store abstraction.

- [ ] Read the applicable architecture roots, useful leaves, business contexts, implementation, tests, callers, and SQL practices before editing.
- [ ] Assemble the integrate tree, root pending work, and release-log pending work in isolation, reconciling package scripts and version without losing harness scripts or master:create.
- [ ] Add regression tests for hash normalization, incomplete API hashes, and rollback build reuse. Confirm they fail against the pending implementation.
- [ ] Implement full-hash validation and script resolution; reuse the most recent matching rollback registration for build evidence without suppressing new rollback events.
- [ ] Replace legacy release conversion with an explicitly documented release-only reset, then install append-only constraints and access controls. Keep both migration copies identical.
- [ ] Normalize newly authored technical documentation/comments to English. Synchronize affected canonical HTTP, database, security, operations, frontend, identity, library, and harness documents; append exact obsolete blocks before replacing them.
- [ ] Make the prompt hook portable across the observed Windows/Bash environment without changing the canonical read-main-entry obligation.
- [ ] Run typecheck, lint, formatting, API tests, build, architecture tests, current and staged architecture validation. Record exact results and distinguish PostgreSQL integration from memory tests.
- [ ] Inspect the entire final diff and run independent source/document/history review. Address blocking findings and rerun affected checks.
- [ ] Transfer the reviewed final change set to main, stage only intended artifacts, validate the index, and create the atomic commit.
- [ ] Run the mandatory branch-review against the exact outgoing commit. Apply and verify the release migration and register the release only when the configured database and credentials permit; never expose secrets.
- [ ] Push only if authorized and all required gates pass. Otherwise report the concrete remaining condition with the completed local commit preserved.

## Progress

- Initial baseline: main and remote main are fcc87e6; integrate contains master, finish-modal, and mobile-list. Root pending master files duplicate its branch. Release log is uncommitted in wt-release-log. Existing focused release tests: 10 passed. Current architecture validation passed; initial staged validation failed because the untracked ownership index was absent from the index.
