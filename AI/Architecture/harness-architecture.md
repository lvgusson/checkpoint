---
id: architecture.harness
title: Architecture documentation and review harness
type: architecture-root
area: harness
status: active
owner: repository-maintainers
last_verified: 2026-10-12
source_paths:
  - AI/read-main-entry.mjs
  - .claude/settings.json
  - .codex/hooks.json
  - AI/validation/validate.mjs
  - AI/validation/git-state.mjs
  - AI/skills/branch-review/scripts/branch-review.mjs
  - AI/hooks/pre-commit.mjs
  - AI/hooks/pre-push.mjs
  - .husky/pre-commit
  - .husky/pre-push
  - .github/workflows/architecture.yml
  - AI/read-main-entry.ps1
related_domains: []
tags: [documentation, git, agents, review]
---

# Architecture documentation and review harness

## 1. Purpose

Provide progressive source-backed context and enforce independently consistent implementation, current documentation, and append-only historical records.

## 2. Scope and ownership

The harness owns agent instructions, canonical architecture maps, metadata/link/navigation checks, source ownership routing, review manifests, and Git/CI gates. Semantic review needs an independent configured agent; deterministic checks cannot prove factual correctness.

## 3. Architecture map

| Responsibility       | Location                                                     | Detail                                                                   |
| -------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------ |
| Agent workflow       | `AGENTS.md`, `AI/main-entry.md`                              | [Contract](../architecture-contract.md)                                  |
| Current architecture | `AI/Architecture/`                                           | [Architecture index](architecture-index.md)                              |
| Exact history        | `AI/Deprecate/`                                              | [Deprecation template](../deprecation-template.md)                       |
| Deterministic checks | `AI/validation/validate.mjs`                                 | [Validation and navigation](harness/validation-and-navigation.md)        |
| Git snapshots        | `AI/validation/git-state.mjs`                                | [Validation and navigation](harness/validation-and-navigation.md)        |
| Independent reviews  | `AI/skills/branch-review/`                                   | [Review skill](../skills/branch-review/SKILL.md)                         |
| Local and CI gates   | `AI/hooks/`, `.husky/`, `.github/workflows/architecture.yml` | [Review protocol](../skills/branch-review/references/review-protocol.md) |

## 4. Contracts and behavior

Complete project evaluations use the canonical [project-review skill](../skills/project-review/SKILL.md), discoverable through `.agents/skills/project-review/SKILL.md`. The principal agent may delegate explicit file allocations to subagents using the same generic mission. Reviewers record dated evidence and coverage under `AI/project-review/yyyy-mm-dd/`; the principal agent reads each report, verifies and dispositions its findings, and creates a central unchecked improvement checklist. These investigation artifacts do not replace current architecture documents or independent pre-push review. Source inspection alone cannot certify workload capacity.

Claude and Codex UserPromptSubmit hooks execute the same portable Node reader. It reads main-entry relative to its own module URL and emits structured additionalContext JSON; a read failure exits 2. The existing PowerShell reader remains available for compatibility. Both hooks use Node already required by the project.

Pre-commit preserves lint-staged, then validates final index blobs against their parent. Pre-push reads exact Git reference operations, validates every outgoing commit/parent and final state, and invokes independent Codex CLI sessions with structured schema output. Missing runtime, failed execution, timeout, incomplete evidence, or incorrect bindings block review.

The review skill is canonical under `AI/skills/branch-review/`; the project skill discovery entry routes to that implementation. Explicit documentation repair is a separate operation and never rewrites commits.

## 5. Invariants

Each commit must stand alone. Archive bytes must remain an exact prefix after appending. No source or user history changes occur during default review. New artifacts use correct English; compatibility-sensitive application names remain intact. A success record is not authoritative remote authorization.

## 6. Dependencies

Node and Git load snapshots; the declared YAML parser reads frontmatter. Existing Husky launches hooks. Semantic review invokes the installed Codex CLI through its verified `exec`, read-only sandbox, schema-output, and last-message options. CI uses GitHub Actions; a trusted semantic runner and remote branch protection require separate configuration.

## 7. Data and state

Working-tree, index, and committed snapshots are distinct. Current documents contain source references and stable IDs; ownership rules route changes to multiple technical/domain owners. Local review artifacts bind to exact manifests and policy hashes and are kept outside versioned architecture content. Review never treats a mutable local record as a secure approval service.

## 8. Source references

`validateSnapshot`, `impactedOwners`, and `archiveEntries` in `AI/validation/validate.mjs`; `snapshot`, `changedPaths`, and `git` in `AI/validation/git-state.mjs`; `buildManifest`, `inspectManifest`, `review`, and `runSession` in the branch-review script. Hook entry points and the CI workflow listed in metadata.

## 9. Related documentation

[Main entry](../main-entry.md), [contract](../architecture-contract.md), [ownership](../validation/ownership.json), [validation leaf](harness/validation-and-navigation.md), [infrastructure](infrastructure-architecture.md), [implementation plan](../implementation-plan.md).

## 10. Evidence and uncertainties

VERIFIED: initial validator tests execute real snapshot checks; branch fixtures exercise disposable Git histories and controlled runtime responses. A real Codex CLI schema smoke test succeeded; it does not establish semantic accuracy for all changes. UNKNOWN: remote branch-protection configuration and trusted semantic CI availability. Existing sandbox setup failures in this authoring session required escalated execution; this is an environment limitation, not permission for the review adapter to bypass sandboxing.
