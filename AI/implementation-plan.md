# Architecture Harness Implementation Plan

> For agentic workers: use the native specialist agents for independent discovery, controlled documentation authoring, branch-review implementation, and final audit. The coordinator owns shared contracts and indexes.

**Goal:** Implement the complete specification in [plan1.md](../plan1.md) without changing application behavior.

**Architecture:** Keep current architecture in a small entry point and linked area/domain documents. Use a Node-based deterministic validator and Git-state manifests, with an independent Codex review adapter for semantic review. Integrate existing Husky checks and add matching CI checks.

**Tech stack:** Existing Node 24, Git, Husky, Angular, PostgreSQL/Supabase, Vercel; Markdown and YAML metadata.

## Execution contract

- The English naming amendment overrides the original misspelled paths: use `AI/Architecture/`, `database`, and `infrastructure`.
- Atomic commit integrity takes precedence: inspect every outgoing commit and final state; later documentation repairs do not excuse earlier inconsistent commits.
- Preserve existing user changes, existing hooks, compatibility-sensitive identifiers, and all production behavior.
- Read actual implementation before authoring factual architecture; mark VERIFIED, INFERRED, and UNKNOWN.
- Preserve exact replaced documentation in append-only archives before replacing it; initial undocumented behavior needs no invented history.
- Review defaults to read-only; explicit repair must preserve concurrent changes and never rewrite history.
- PASS requires complete independent evidence; unavailable runtime, timeout, or incomplete review means INCONCLUSIVE and blocks push.
- Work locally in the existing workspace because the initial user-owned bootstrap files are untracked here. No actual application history rewriting is needed.

## Task 1: Discovery and synthesis

- [x] Inspect Git state, instructions, tool capabilities, existing hooks, and documentation.
- [x] Delegate cartography/frontend, backend/domain/cache, and data/security/infrastructure investigation with non-overlapping responsibilities.
- [x] Preserve standard investigation reports, reconcile source evidence, and define canonical document ownership.

## Task 2: Documentation foundation and current architecture

Files: `AGENTS.md`, `AI/main-entry.md`, `AI/architecture-contract.md`, the three templates, `AI/Architecture/**`, `AI/Deprecate/**`.

- [x] Archive the exact existing main entry before replacing it.
- [x] Create mandatory read/analyze/implement/document/archive/validate/commit/review/push procedures and English policy.
- [x] Write area maps, relevant module leaves, and actual business-context documents with source references and cross-links.
- [x] Create an explicit machine-readable ownership index with multiple affected areas and related domains.

## Task 3: Validation and branch review

Files: `AI/validation/**`, `AI/skills/branch-review/**`, `AI/hooks/**`, existing Husky entry points, CI workflow, runtime configuration, project skill discovery pointer.

- [x] Use isolated fixture repositories for failing structural/history/review cases before implementing checks.
- [x] Validate parsed YAML, schema/IDs, paths, links, navigation, naming, ownership, append-only history, and staged content.
- [x] Build push manifests from actual hook input for multiple/new/deleted references and merge parents.
- [x] Invoke a verified installed Codex CLI interface; validate evidence completeness and exact state bindings; timeouts fail closed.
- [x] Package the concise skill and detailed review/result contracts; support controlled explicit repair.
- [x] Preserve lint-staged and commitlint; install the gate through existing Husky and validate hook execution.
- [x] Add deterministic CI enforcement; report semantic CI and remote branch-protection configuration limits accurately.

## Task 4: Independent verification

- [x] Exercise all 15 branch-review scenarios specified in plan1.md, including intermediate broken commits, dirty worktrees, invalidated approval, and unavailable runtime.
- [x] Exercise all ten navigation scenarios without modifying application code.
- [x] Independent auditor checks code/documentation correspondence and history, then resolve material findings.
- [x] Run appropriate project checks and report verified results, discovered domains, unresolved deployment assumptions, and local/runtime limitations.

## Review focus

- Staged files may differ from working-tree files: validate the index snapshot.
- New branches and multiple refs cannot use a guessed `HEAD~1` baseline.
- Archive content must preserve exact historical logical blocks, including original line endings.
- Dirty user worktrees must survive both review and repair.
- A JSON PASS or filename coverage alone cannot establish semantic correctness or authoritative remote enforcement.
