# Checkpoint architecture harness

Read this file again at every user message before responding or taking action. It is the canonical project instruction entry point for Codex, Claude, and other coding agents.

## Language and naming policy

All AI-authored technical documentation, architectural descriptions, internal agent instructions, skill definitions, newly created identifiers, filenames, directory names, and code comments MUST use grammatically correct, technically precise English. Normalize misspellings silently in new artifacts. Preserve existing public API fields, database columns, domain identifiers, external contracts, framework conventions, configuration keys, and compatibility-sensitive legacy filenames. Conversation follows the user's preferred language.

## Mandatory workflow

Before modifying application files:

1. Classify the change and identify every affected area and business context using [the architecture index](Architecture/architecture-index.md), [domain index](Architecture/domains/domains-index.md), and [ownership map](validation/ownership.json).
2. Read relevant area roots and follow each relevant documentation branch to its deepest useful leaf. Repeat for all affected branches; do not load unrelated siblings.
3. Read affected domain documentation even for frontend/backend changes that affect business behavior.
4. Inspect actual implementation, relevant tests, downstream callers, shared models, and cross-cutting dependencies. Treat documentation as claims to verify, not automatic truth.
5. Form a concrete implementation plan respecting observed invariants and boundaries.

During changes, verify undocumented assumptions against source, record new relationships, and identify obsolete documentation. Distinguish VERIFIED, INFERRED, and UNKNOWN. Do not invent DDD patterns, deployed infrastructure, or absent controls.

After changes, in the same change set:

1. Reinspect implementation and synchronize affected current documents; create cohesive new leaves only when justified.
2. Before replacing or removing an architectural fact, append its exact previous complete logical block to the corresponding history archive. Retired documents must be archived in full. Never modify existing historical entries.
3. Update parent indexes, ownership routing, and useful cross-domain links. Each fact has one canonical owner.
4. Validate metadata, links, source references, navigation, changed-source coverage, and exact historical preservation. Execute relevant implementation checks.
5. Report implementation and documentation together. If no documented fact changed, report the source-based verification rather than an artificial documentation rewrite.

Missing documentation requires source investigation first. Extend an existing document or create a leaf when the responsibility is cohesive, reusable, complex, or operationally critical; link it from its parent. Follow [the documentation contract](architecture-contract.md) and [architecture](documentation-template.md), [domain](domain-template.md), and [history](deprecation-template.md) templates.

## Area routing

| Change                              | Initial branches                                                                                                                    |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Routes, components, browser state   | [Frontend](Architecture/front-end-architecture.md), affected domain, [cache](Architecture/cache-architecture.md)                    |
| HTTP/API/service behavior           | [Backend](Architecture/back-end-architecture.md), affected domain, storage/security as applicable                                   |
| Scoring, prerequisites, pins, lists | [Prioritization](Architecture/domains/prioritization/domain.md), backend, frontend, database, cache                                 |
| Game lifecycle or shared catalogue  | [Game library](Architecture/domains/game-library/domain.md), backend, database, frontend                                            |
| Steam, acquisition, prices          | [Wishlist](Architecture/domains/wishlist/domain.md), backend, cache, database                                                       |
| Schema, migrations, SQL             | [Database](Architecture/database-architecture.md), related domains, security, infrastructure                                        |
| Authentication or owner isolation   | [Security](Architecture/security-architecture.md), [identity](Architecture/domains/identity/domain.md), frontend, backend, database |
| Hosting, releases, runtime          | [Infrastructure](Architecture/infrastructure-architecture.md), backend, database                                                    |
| Agent policy, validation, hooks     | [Harness](Architecture/harness-architecture.md), infrastructure and impacted owners                                                 |

A change may affect multiple branches. Determine actual relationships instead of assuming single-area ownership.

## Mandatory atomic commit and push integrity

READ → ANALYZE → IMPLEMENT → DOCUMENT → ARCHIVE → VALIDATE → COMMIT → BRANCH-REVIEW → PUSH.

Every commit MUST independently contain consistent application code, affected architecture/domain documentation, and required deprecation records. A later corrective commit does not excuse an inconsistent intermediate commit. Documentation-only commits are allowed when accurate for their implementation state.

Before committing, inspect the staged implementation and affected documents, archive superseded facts, and run `npm run architecture:staged`. Husky preserves existing lint-staged and commitlint checks and invokes the structural validator against the resulting index snapshot.

Before every push, invoke [branch-review](skills/branch-review/SKILL.md). The pre-push gate derives exact outgoing commits from Git's reference input, independently reviews every commit against appropriate parents and every final pushed state, and assigns specialized reviewers according to actual architectural risk. A push with no outgoing commits still runs applicable lightweight checks.

Every push to `main` MUST register a new release record (`POST /api/v1/releases` or `npm run release:note`) describing what is being pushed; see the [release registration policy](Architecture/infrastructure/deployment-and-release.md#release-registration-policy).

PASS requires all mandatory checks and complete independent source/document/history evidence. FAIL and INCONCLUSIVE MUST block push. Runtime errors, unavailable reviewers, timeouts, and incomplete evidence are not approval. Results bind to repository identity, exact references and commits, policy/skill/document hashes, reviewer roles, and validation results. Changed relevant inputs invalidate prior review. Local JSON is not secure authorization.

Review defaults to read-only. Explicit `branch-review --repair` may prepare documentation-only repairs, preserving existing uncommitted changes and archives; it must not amend commits, rebase, rewrite history, or change production code. Report commits that need correction. Commit rewriting always needs separate explicit authorization.

## Complete project evaluation

When the user requests a complete project evaluation, use the canonical [project-review skill](skills/project-review/SKILL.md). The principal agent may launch subagents for this evaluation. Every subagent must use that same generic skill and mission, covering architecture, SOLID (especially Open/Closed), simple human-readable code, maintainability, performance, resilience, and scalability. Assign explicit file coverage and record exclusions rather than claiming unread files were reviewed.

Create dated independent reports under `AI/project-review/yyyy-mm-dd/`. After each subagent finishes, the principal agent must read its entire Markdown report, verify findings against source and contracts, and record whether each finding makes sense: accepted, corrected, rejected, or unresolved, with reasons. The principal agent must produce a central `summary.md` with linked evidence, coverage limitations, and a prioritized unchecked improvement checklist with acceptance criteria for a future agent to implement if the user requests it. Preserve earlier runs. Review authorization does not authorize application changes or production load tests; capacity claims require measured evidence for the specified workload.

## Checks and operating limits

- `npm run architecture:check`: current documentation structure and navigation.
- `npm run architecture:staged`: proposed index snapshot and parent history.
- `npm run architecture:test`: isolated structural, navigation, and branch-review scenarios.
- `npm run branch-review -- --base <commit> --head <commit>`: independent outgoing-range review.
- [Git hooks](hooks) integrate with existing Husky configuration; see [the harness map](Architecture/harness-architecture.md).
- CI performs independent deterministic checks. Trusted semantic CI and remote branch protection require separately configured runtime and repository permissions; do not claim they are active merely because a workflow exists.

Never change application code before required discovery, skip business context, present speculation as implemented, remove history, retain obsolete behavior as current, create dead links, or make undocumented breaking changes.
