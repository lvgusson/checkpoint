---
id: architecture.harness.validation
title: Structural validation and progressive navigation
type: component
area: harness
status: active
owner: repository-maintainers
last_verified: 2026-10-12
source_paths:
  - AI/validation/validate.mjs
  - AI/validation/git-state.mjs
  - AI/validation/validate.test.mjs
  - AI/validation/ownership.json
related_domains: []
tags: [yaml, metadata, history, ownership, navigation]
---

# Structural validation and progressive navigation

## 1. Purpose

Detect structural documentation violations and route source changes to the documents an independent semantic reviewer must inspect.

## 2. Scope and ownership

Checks own structure, paths, schema, stable IDs, navigation, source coverage, and exact history. They cannot decide whether prose accurately describes a complex algorithm or whether new code leaves an existing fact unchanged.

## 3. Architecture map

| Responsibility       | Location                            | Detail                                                      |
| -------------------- | ----------------------------------- | ----------------------------------------------------------- |
| YAML/schema checks   | `AI/validation/validate.mjs`        | `validateSnapshot`                                          |
| Multi-owner impact   | `AI/validation/ownership.json`      | `impactedOwners`                                            |
| Snapshot extraction  | `AI/validation/git-state.mjs`       | `snapshot`, batched blob reads                              |
| Regression fixtures  | `AI/validation/validate.test.mjs`   | [Verification record](../../validation/bootstrap-report.md) |
| Navigation scenarios | `AI/validation/navigation.test.mjs` | [Verification record](../../validation/bootstrap-report.md) |

## 4. Contracts and behavior

`validateSnapshot(Map<string, Buffer>, {baseFiles, changes, requireCoverage})` returns PASS/FAIL, errors/warnings, parsed current documents, and impacted area/domain/document paths. The CLI defaults to working-tree files; `--staged` loads Git index blobs; `--base HASH --head HASH` compares exact committed states.

Metadata is parsed as YAML with duplicate keys rejected. Active architecture documents require ten sections; domain documents fourteen. Indexes are navigation maps. Relative Markdown links, heading anchors, source paths, unique IDs, related domains, and reachability from main entry are checked. Fenced examples and historical archive links are excluded from current navigation.

## 5. Invariants

An archive cannot shrink or replace any existing byte. New entries must have unique IDs, timestamp/timezone, source, original ID/section, reason, replacement, related code, change reference, and fenced exact previous material. Removed/replaced logical blocks require exact copies; unchanged relocations and whitespace-only formatting do not fabricate deprecations.

## 6. Dependencies

Git supplies index/commit blobs and rename-aware diffs. Node buffers preserve archive bytes. YAML parsing uses the declared `yaml` development dependency. The branch gate consumes structural findings and source impact to perform semantic verification.

## 7. Data and state

Ownership is an explicit multi-rule map; overlapping patterns intentionally route to more than one owner. Impact includes parent and resulting ownership maps so removing a rule cannot erase previous responsibility. A path-pattern match indicates navigational ownership only, not complete semantic coverage.

## 8. Source references

`validateSnapshot`, `metadata`, `links`, `logicalBlocks`, `archiveEntries`, `impactedOwners`, `runValidation` in the validator; `objects`, `snapshot`, `changedPaths` in Git snapshot utilities.

## 9. Related documentation

[Harness root](../harness-architecture.md), [schema contract](../../architecture-contract.md), [domain index](../domains/domains-index.md), [review protocol](../../skills/branch-review/references/review-protocol.md).

## 10. Evidence and uncertainties

VERIFIED: fixture tests cover broken schema/navigation/source paths, orphan documents, unmapped changes, immutable archive prefixes, exact previous section capture, malformed history, and parent-owner retention. INFERRED: a semantically conservative block comparison may require an archival copy for a prose rewrite that preserves intent; independent review determines factual change. UNKNOWN: semantic completeness beyond inspected evidence and behavior of unexercised external services.
