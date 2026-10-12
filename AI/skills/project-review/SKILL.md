---
name: project-review
description: Use when asked to review an entire project for architecture, SOLID, human readability, maintainability, performance, scalability, or readiness for a specified workload.
---

# Evidence-based project review

## Mission

Evaluate the actual project with senior engineering judgment: correctness, simple human-readable code, maintainability, design patterns, SOLID (especially Open/Closed), performance, security, operational resilience, and scalability. Use the same mission for every reviewer; assigned areas determine coverage, not different standards. Review is read-only except for review artifacts. Do not implement recommendations, commit, push, run production workloads, expose secrets, or invent deployed controls.

Read the repository's canonical instructions and architecture/domain branches. Treat documentation as claims to verify against complete implementation, callers, tests, configuration, and migrations.

The [reusable review request](references/review-prompt.md) provides a precise invocation prompt when the user wants to repeat or refine this evaluation.

## Coordinator workflow

1. Establish date/timezone, Git HEAD, dirty state, workload target, and an inventory of tracked and nonignored untracked project files. Preserve user changes. Include hidden configuration. Identify generated/vendor content, binaries, secrets, and inaccessible files explicitly; never silently equate an inventory with reading.
2. Create `AI/project-review/yyyy-mm-dd/` and a coverage manifest before dispatch. When reusing a date, preserve earlier reports using distinct run filenames. Record file hashes, assigned reviewer, and inspection status. Exclude the current run's generated reports from recursive review. The optional repository helper `node AI/skills/project-review/scripts/inventory.mjs AI/project-review/yyyy-mm-dd/inventory.json` captures hashes and an initial allocation; adapt allocations to the actual repository. It does not establish inspection status.
3. Use subagents when requested or permitted by repository instructions. Every agent must read this same skill and receive the same mission and workload, plus an explicit file allocation and unique report path. Cover every first-party text file one by one, in complete numbered chunks without truncation; traverse dependencies beyond assignments when needed. Record full line ranges actually read. Deduplicate identical third-party material by content hash and list each alias. For binaries inspect metadata/purpose and record that line review is inapplicable. Handle secret files through redacted structural inspection only.
4. Reviewers write independent Markdown reports. The coordinator reads every completed report in full, checks each finding against source and relevant contracts, and records accepted, corrected, rejected, or unresolved dispositions with reasons. Reconcile disagreements and duplicate root causes. Close coverage gaps or disclose them explicitly. Recheck hashes before finalizing; re-review changed files.
5. Produce a central `summary.md` with verdicts, coverage, validation results, limitations, and an actionable prioritized checklist linked to each report. Each accepted task needs evidence, affected boundaries, a minimal compatible change, regression protection, dependencies, and measurable acceptance criteria. Leave tasks unchecked until implemented and verified by a separately authorized task.

## Evaluation criteria

- Trace representative reads, writes, authentication, background work, integrations, and failure paths end to end. Evaluate bounded work, pagination, query count, indexes, isolation, locking, cache invalidation, connection budgets, retries, backpressure, idempotency, consistency across replicas, observability, recovery, and deployment assumptions.
- Assess all five SOLID principles through concrete change scenarios. For Open/Closed, demonstrate what adding a rule/provider/workflow would require changing and how existing behavior is protected. Existing conditionals alone are not a violation. Recommend extension seams only at demonstrated change boundaries; prefer clear functions and composition over speculative frameworks or inheritance.
- Evaluate naming, control flow, responsibility size, explicit dependencies, hidden state, duplication, understandable error behavior, and tests that preserve contracts. Large files are investigation signals, not automatic defects. Identify sound decisions as well as problems.
- Separate simultaneous users, open connections, active requests, and requests per second. For a target such as 1,000,000 concurrent users and 1,000,000 requests/second, define workload mix, payloads, dataset distribution, cache hit rates, latency/error SLOs, geography, duration, consistency, and cost assumptions. Use capacity arithmetic with labeled assumptions; `in-flight requests = requests/second × average latency in seconds`. Static review cannot certify capacity. Require representative isolated load/soak tests, telemetry, database plans, infrastructure quotas, failure testing, and cost evidence before declaring readiness. Never direct such load at live systems without explicit authorization.
- Label facts VERIFIED, interpretations INFERRED, and missing evidence UNKNOWN. Cite local paths, line numbers, symbols, and a reproducible trigger. Consult current primary documentation for uncertain external behavior; distinguish source observations from vendor limits.

## Required reviewer report

Write `AI/project-review/yyyy-mm-dd/<area>-review.md` (use a distinct run suffix on collision), in precise English. Include:

1. Date/timezone, reviewer, area, shared mission, workload, HEAD, dirty state, and report status.
2. A file coverage table with each path, hash or manifest reference, complete inspected line ranges, inspection method, and exclusions/gaps. Include files with no findings.
3. A concise area verdict, strengths, and source-based architectural map.
4. Findings with stable IDs, severity (critical/high/medium/low), confidence, exact evidence, impact/trigger, smallest useful improvement, compatibility risks, and verification criteria. Separate defects, scalability blockers, maintainability risks, and measurement needs.
5. SOLID assessment with explicit Open/Closed extension scenarios; readability and simplicity assessment.
6. Capacity assessment with assumptions, bottlenecks, and missing measurements. Do not invent throughput benchmarks.
7. Checks actually executed and results, dependencies on other areas, uncertainties, and a proposed unchecked action list.

An incomplete report must say INCOMPLETE and identify remaining files. Completion requires both report reconciliation and honest coverage accounting; passing existing tests is not proof of scalability.
