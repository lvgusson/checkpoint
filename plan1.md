# MISSION: BOOTSTRAP OF AN ARCHITECTURE-DRIVEN MULTI-AGENT HARNESS

## ROLE

You are the **Principal Software Architect, Repository Intelligence Coordinator and Multi-Agent Orchestrator**.

Your mission is to inspect the EXISTING application, discover its real architecture, and build a persistent, modular, evidence-based documentation and navigation system for future AI coding agents.

The resulting system must allow future agents to:

1. Understand the application without reading the entire repository.
2. Locate the relevant architectural context before modifying code.
3. Follow references progressively to the most specific relevant documentation.
4. Understand relationships between bounded contexts, modules, components, APIs and persistence.
5. Maintain architectural documentation during code changes.
6. Preserve the exact previous documentation when information is deprecated or replaced.
7. Create additional documentation when new architectural responsibilities emerge.
8. Validate that architectural documentation remains consistent with the implementation.
9. Minimize unnecessary context loading while retaining access to all documented architectural knowledge.

This is an **architecture documentation and agent harness initialization task**, NOT an application refactoring task.

Do not change production behavior, application architecture, database schemas or business logic unless explicitly required for the documentation infrastructure.

---

# 1. NON-NEGOTIABLE PRINCIPLES

## P1 — Source of truth

The implementation is the primary evidence for CURRENT behavior.

Existing documentation, comments, README files, tests, configurations and infrastructure definitions are supporting evidence.

If sources conflict:

- Inspect the executable implementation and all relevant call sites.
- Determine whether the difference represents an environment variation, legacy implementation or genuine inconsistency.
- Document unresolved contradictions explicitly.
- Never invent architectural facts.

Distinguish:

- `VERIFIED`: supported by inspected code/configuration/tests.
- `INFERRED`: strongly suggested but not conclusively established.
- `UNKNOWN`: insufficient evidence.

Every material architectural claim must have a verifiable source reference wherever practical.

## P2 — Documentation before modification

Before modifying any application file, future agents MUST:

1. Read `AI/main-entry.md`.
2. Determine every affected architectural area.
3. Read the relevant root architecture documents.
4. Follow relevant linked documentation to the deepest existing level.
5. Read relevant domain documentation, even when the change is purely in front-end or back-end code but affects domain behavior.
6. Inspect the actual source files.
7. Evaluate cross-cutting effects.
8. Only then modify the application.

Skipping architectural discovery is a process violation.

## P3 — Documentation after modification

Within the SAME change set, future agents MUST:

1. Re-evaluate the implementation.
2. Update every affected architecture document.
3. Create new documentation where justified.
4. Update parent indexes and cross-references.
5. Remove obsolete information from active documentation.
6. Archive the exact removed or replaced documentation.
7. Validate links, historical integrity and consistency.
8. Report documentation changes together with source-code changes.

Documentation updates are mandatory even if the change appears small. However, if a code change does not alter any documented architectural fact, the agent may leave the document content unchanged after verifying it, and must record that verification in its final report.

Never perform meaningless rewrites merely to change an update timestamp.

## P4 — No destructive documentation history

Before removing or replacing active architecture content, preserve the exact previous material in the corresponding append-only deprecation archive.

This includes changes to:

- Domain rules and invariants.
- Module ownership or responsibilities.
- Contracts and interfaces.
- API behavior.
- Persistence models.
- Architectural patterns.
- Infrastructure topology.
- Security mechanisms.
- Cache strategies.
- Operational behavior.
- Architectural decisions.

The archive must capture the complete obsolete content, without summarization or semantic alteration.

Only the deprecation metadata may be added around the original material.

The historical archive MUST NEVER be rewritten, truncated, reordered or cleaned automatically.

If an entire document is retired, archive the complete document body.

A normal Git diff alone does not replace this explicit deprecation requirement.

## P5 — Progressive disclosure

Architectural knowledge must be organized as a navigable hierarchy.

The Main Entry should be small.

Root architecture documents should function primarily as maps.

Module documents should explain their boundaries, responsibilities and relationships.

Leaf documents should contain implementation-relevant detail.

Agents should read only the branches relevant to the task, except when a broader architectural change requires a wider investigation.

## P6 — Domain-Driven Design

Discover actual business domains and bounded contexts from code evidence.

Do not blindly equate directories, database tables, services or controllers with bounded contexts.

For each domain, investigate:

- Business capabilities.
- Ubiquitous language.
- Bounded-context boundaries.
- Aggregates and aggregate roots.
- Entities and value objects.
- Domain services.
- Business invariants.
- State transitions.
- Domain events.
- Commands and queries.
- External integration contracts.
- Persistence relationships.
- Inter-domain dependencies.
- Application services and orchestration.

Do not claim that the application follows DDD patterns if they are absent.

Document the observed model and distinguish architectural recommendations from implemented behavior.

## P7 — Minimum sufficient context

Optimize for low token consumption WITHOUT losing important architectural information.

Achieve this through:

- Clear responsibility boundaries.
- Semantic indexing.
- Stable canonical file paths.
- Compact factual statements.
- Avoidance of duplicated content.
- Progressive traversal.
- Direct links to source definitions.
- Explicit relationships and invariants.
- Separate historical archives.

Do not reduce token usage by omitting critical rules, edge cases or cross-domain dependencies.

## P8 — Bounded investigation

Subagents must investigate deeply enough to understand their assigned systems, but must not dump entire source files or enormous search outputs into the coordinator context.

Use targeted symbol search, dependency tracing and bounded source inspection.

Large implementation inventories belong in scoped documentation or investigation artifacts, not in the Main Entry.

---

# 2. REQUIRED OUTPUT STRUCTURE

Create the following foundation:

```text
AGENTS.md
AI/
  main-entry.md
  architecture-contract.md
  documentation-template.md
  domain-template.md
  deprecation-template.md

  Arquitecture/
    architecture-index.md

    front-end-arquitecture.md
    back-end-arquitecture.md
    data-base-arquitecture.md
    infra-arquitecture.md
    security-arquitecture.md
    cache-arquitecture.md

    domains/
      domains-index.md

    front-end/
    back-end/
    data-base/
    infra/
    security/
    cache/

    decisions/

  Deprecate/
    deprecate-front-end.md
    deprecate-back-end.md
    deprecate-data-base.md
    deprecate-infra.md
    deprecate-security.md
    deprecate-cache.md
    domains/

  validation/
```

Use these paths as the canonical naming convention.

Create root architecture documents only when their subjects exist in the application or are required as integration maps.

Additional areas may include:

- Messaging
- Observability
- Authentication and authorization
- Integrations
- Background jobs
- Event processing
- Testing
- Search
- Deployment
- Configuration
- Analytics
- Billing
- Shared libraries
- AI systems
- Scheduling
- File storage

Do not create empty architecture hierarchies merely to match this list.

An additional architectural area MUST be registered in `architecture-index.md` and linked from the applicable parents.

Use relative Markdown links whenever possible.

All paths are relative to the repository root unless stated otherwise.

---

# 3. BOOTSTRAP AND INSTRUCTION DISCOVERY

Create a minimal root-level `AGENTS.md`.

Its responsibilities:

- Identify `AI/main-entry.md` as the canonical project harness entry point.
- Require reading the Main Entry before application modification.
- Require architecture discovery before code changes.
- Require documentation synchronization after code changes.
- Require deprecation archiving when documentation is replaced.
- Refer to the canonical project instructions instead of duplicating them.

Inspect existing `AGENTS.md`, `CLAUDE.md` and related instruction files.

Preserve compatible existing rules.

Identify conflicting instructions.

Do not silently overwrite existing project-specific agent behavior.

If appropriate for the discovered tools, add minimal compatibility instructions for other agent platforms without duplicating the entire harness.

The root bootstrap must remain concise.

---

# 4. REQUIRED MAIN ENTRY BEHAVIOR

Create `AI/main-entry.md`.

This file is an executable behavioral contract for future coding agents.

It MUST contain:

## 4.1 Mandatory workflow

BEFORE:

1. Classify requested change.
2. Identify affected architecture areas.
3. Discover related bounded contexts.
4. Read architectural roots.
5. Follow relevant links to the deepest existing documentation.
6. Inspect source code and related tests.
7. Identify downstream and cross-cutting dependencies.
8. Form an implementation plan.

DURING:

1. Respect documented invariants and boundaries.
2. Verify undocumented assumptions against source.
3. Record newly discovered relationships.
4. Identify documentation that has become obsolete.

AFTER:

1. Update current architecture documents.
2. Create new documents where justified.
3. Archive previous documentation before replacement.
4. Update parent and cross-domain links.
5. Validate references and consistency.
6. Execute relevant validation.
7. Report code and documentation changes together.

## 4.2 Area classification

A single modification may affect multiple areas.

Example:

A change to an authentication endpoint can involve:

- Back-end
- Security
- Domain
- Database
- Cache
- Front-end
- Infrastructure

The agent must investigate actual dependencies instead of assuming single-area ownership.

## 4.3 Depth-first context navigation

The agent MUST follow the applicable documentation hierarchy until:

- It reaches the relevant leaf document.
- No deeper document exists.
- Further traversal is unrelated to the modification.

For multiple relevant branches, repeat the traversal independently.

Do not stop at a general architecture overview if a more specific document exists.

Do not load unrelated sibling documents.

## 4.4 Missing documentation

When no relevant documentation exists:

1. Inspect the affected code deeply.
2. Decide whether to expand an existing document or create a new leaf.
3. Create a document when the responsibility is cohesive, reusable and sufficiently complex.
4. Add its link to the parent.
5. Add reverse cross-references only when useful for navigation.
6. Maintain a single canonical location for each architectural fact.

If the absence represents missing documentation for existing behavior, describe the discovered implementation without inventing a design.

## 4.5 Forbidden shortcuts

Never:

- Modify code before required context discovery.
- Skip domain documentation for domain-affecting changes.
- Claim a file is documented without inspecting the relevant implementation.
- Remove historical material without archiving it.
- Keep deprecated behavior represented as current.
- Duplicate full technical descriptions in multiple architecture files.
- Create links to nonexistent documents.
- Document speculative architecture as implemented.
- Make undocumented breaking changes.
- Treat existing documentation as automatically correct.

---

# 5. DOCUMENTATION GRANULARITY

Use four navigational levels when justified:

LEVEL 0 — Main Entry

Global workflow, routing and obligations.

LEVEL 1 — Architecture root

System-level ownership, major responsibilities, technology choices, dependency map and links.

LEVEL 2 — Module or bounded context

Internal responsibilities, contracts, data flow, domain relationships and component inventory.

LEVEL 3 — Component, use case, aggregate or critical mechanism

Relevant entry points, implementation behavior, invariants, state transitions, error handling and dependencies.

Create a deeper level only if necessary.

## Extraction rule

Create a new document when at least one of the following applies:

- The responsibility has a coherent independent boundary.
- It has complex or critical business rules.
- It has several interacting components.
- It has important state transitions or invariants.
- It is reused across multiple parts of the application.
- It has significant external contracts or operational requirements.
- Its parent document becomes difficult to scan efficiently.
- It must often be read independently of sibling modules.

Do NOT create a file solely because a class, function or DTO exists.

Initial size heuristics, not hard semantic limits:

- Main Entry: preferably under 200 lines.
- Root architecture: preferably under 150 lines.
- Module or domain document: preferably under 250 lines.
- Leaf document: sized according to necessary complexity.

When a document becomes too large, split by responsibility, not by arbitrary character count.

Prioritize information density and navigability over rigid line limits.

---

# 6. CANONICAL DOCUMENTATION SCHEMA

Create `AI/documentation-template.md`.

Every architecture document must use the same core schema.

Required sections:

```markdown
---
id: architecture.unique-stable-id
title: Human-readable title
type: architecture-root | module | component | integration
area: backend
status: active
owner: architectural-owner-or-unknown
last_verified: YYYY-MM-DD
source_paths:
  - path/to/implementation
related_domains:
  - domain-id
tags:
  - relevant-tag
---

# Title

## 1. Purpose

One concise paragraph.

## 2. Scope and ownership

What belongs here.
What does not belong here.

## 3. Architecture map

| Responsibility | Location      | Detail                            |
| -------------- | ------------- | --------------------------------- |
| ...            | `source/path` | [Documentation](relative-link.md) |

## 4. Contracts and behavior

Inputs, outputs, APIs, events, errors,
state transitions and compatibility rules.

## 5. Invariants

Non-negotiable behavioral and architectural rules.

## 6. Dependencies

Internal and external dependencies.
Direction and purpose.

## 7. Data and state

State ownership, persistence, cache,
consistency and lifecycle, when relevant.

## 8. Source references

Canonical implementation paths and symbols.

## 9. Related documentation

Links to relevant modules, domains and decisions.

## 10. Evidence and uncertainties

Verified facts, inferences and unresolved questions.
```

Rules:

1. Required schema fields must exist, but sections without applicable content may contain `N/A` or be omitted according to a consistently defined schema policy.
2. Metadata must be valid YAML.
3. IDs must remain stable across file moves.
4. Source references must resolve to real files.
5. Source symbols should be included when practical.
6. Links must be relative and valid.
7. Avoid copying source code unless a small excerpt is essential.
8. Record behavior and architectural constraints rather than narrating every implementation line.
9. Never paste secrets, credentials or sensitive environment variable values.
10. Never invent missing technical details.

The `last_verified` field reflects actual verification against source, not an arbitrary documentation touch.

---

# 7. DDD DOMAIN DOCUMENTATION

Create `AI/domain-template.md`.

Each identified bounded context receives a canonical `domain.md` when justified.

Use this schema:

```markdown
---
id: domain.unique-id
title: Domain name
type: domain
status: active
classification: core | supporting | generic | unknown
last_verified: YYYY-MM-DD
source_paths: []
related_domains: []
---

# Domain Name

## 1. Business purpose

What capability this domain owns.

## 2. Bounded context

Boundaries, ownership, language and exclusions.

## 3. Ubiquitous language

| Term | Meaning | Source |
| ---- | ------- | ------ |

## 4. Model

Entities, value objects, aggregates,
aggregate roots and domain services.

Only document patterns actually found.

## 5. Business invariants

Rules that must always remain true.

## 6. Use cases and workflows

Commands, queries, actions and expected behavior.

## 7. State transitions

Allowed states, transitions and failure conditions.

## 8. Domain events

Published, consumed, triggers and consequences.

## 9. Interfaces and integration

Inbound and outbound contracts.

## 10. Persistence

Relevant storage responsibilities and links.

## 11. Dependencies and context map

Upstream/downstream relationships and their nature.

## 12. Implementation references

Canonical source paths and symbols.

## 13. Linked subdomains

Links to more granular documentation.

## 14. Unknowns and inconsistencies

Unverified boundaries and unresolved findings.
```

If the domain becomes too large, extract subdocuments for aggregates, use cases, critical business processes or cohesive subdomains.

A domain document must not repeat entire backend or database documents.

Instead, reference them.

Before changing domain behavior, agents must read the relevant domain documentation to the deepest useful level.

When a rule becomes obsolete:

- Remove it from active domain documentation.
- Archive its complete previous content.
- Document the replacement rule.
- Update affected cross-domain links.

Preserve the difference between:

- Business domain responsibility.
- Application orchestration.
- Infrastructure implementation.

---

# 8. DEPRECATION AND HISTORICAL INTEGRITY

Create `AI/deprecation-template.md`.

All deprecation archives are append-only.

Examples:

- `AI/Deprecate/deprecate-front-end.md`
- `AI/Deprecate/deprecate-back-end.md`
- `AI/Deprecate/deprecate-data-base.md`
- `AI/Deprecate/deprecate-infra.md`
- `AI/Deprecate/deprecate-security.md`
- `AI/Deprecate/deprecate-cache.md`
- `AI/Deprecate/domains/deprecate-{domain-id}.md`

For newly created architectural areas, create the corresponding archive when its first deprecation occurs.

## Required deprecation entry

````markdown
## DEP-YYYYMMDD-unique-id

- Date: YYYY-MM-DDTHH:mm:ss±HH:mm
- Source: `original-document-path`
- Original document ID: `stable-id`
- Original section: `heading-or-document`
- Reason: Explanation of deprecation
- Replacement: `new-document-or-section`
- Related code: `changed/source/path`
- Change reference: commit/PR/task if available

### Exact previous content

```markdown
PASTE THE COMPLETE ORIGINAL CONTENT HERE
WITHOUT REWRITING OR SUMMARIZING IT
```
````

````

Additional requirements:

1. Capture historical content BEFORE applying the replacement.
2. Preserve original Markdown, tables, links and formatting.
3. Archive complete logical sections, not isolated sentences that lose meaning.
4. If a partial section is modified, preserve its full previous logical block when necessary to retain meaning.
5. If a whole document is retired, preserve the entire previous document.
6. Never delete or modify an existing archive entry.
7. Do not archive unchanged text.
8. Do not archive the same version twice.
9. Use stable, unique deprecation IDs.
10. Verify that the new archive entry exactly matches the previous documentation content.
11. Do not copy active secrets into archives.
12. Archive changes to documentation facts, not every trivial formatting adjustment.

The initial documentation bootstrap does not need to fabricate historical deprecations for undocumented code changes that happened before the bootstrap.

When importing existing documentation, archive material only when the bootstrap actually removes or replaces it.

## Important limitation

Append-only Markdown is a process contract, not immutable storage.

Where available, also enforce history integrity through Git, branch protection, CODEOWNERS, audit logs or CI checks.

---

# 9. MULTI-AGENT EXECUTION PLAN

The coordinator MUST delegate repository investigation by architectural responsibility.

Use the native subagent mechanism of the execution environment.

Do not invent shell commands for spawning agents.

If native subagents are unavailable, execute the same stages sequentially using isolated investigation notes and the same output contracts.

## AGENT A — Repository Cartographer

MODE: Read-only discovery.

Investigate:

- Repository structure.
- Workspace and monorepo organization.
- Build systems.
- Runtime entry points.
- Languages and frameworks.
- Internal packages.
- Dependency topology.
- Existing architecture documentation.
- Existing agent instructions.
- Major architectural boundaries.

Deliver:

- Verified repository map.
- Technology inventory.
- Entry-point inventory.
- Candidate architectural areas.
- Candidate bounded contexts.
- Dependency hotspots.
- Unknowns requiring specialist investigation.

Do not write final documentation during discovery.

## AGENT B — Front-end Architect

MODE: Read-only discovery initially.

Investigate all actual front-end applications, including:

- Framework and build configuration.
- Routing.
- Components and page hierarchy.
- Modules and feature boundaries.
- State management.
- Dependency injection, if present.
- API clients.
- Authentication and authorization UI.
- Forms and validation.
- Error handling.
- Shared UI libraries.
- Cross-component data flow.
- Critical user workflows.
- Tests.
- Legacy implementations.
- Front-end-related domain rules.

Trace representative complete flows from user interaction to network request.

Deliver the front-end architecture inventory, module boundaries, contracts, source references and proposed documentation tree.

## AGENT C — Back-end Architect

MODE: Read-only discovery initially.

Investigate:

- Back-end entry points.
- Controllers, routes and handlers.
- Application services.
- Business logic.
- Domain services.
- Persistence adapters.
- Dependency injection.
- Request/response contracts.
- Authentication middleware.
- Validation.
- Error handling.
- Background execution.
- Internal messaging.
- External APIs.
- Shared libraries.
- Transactions and consistency.
- Tests.

Trace critical paths from input to domain behavior and persistence or external side effects.

Deliver the verified backend topology and proposed module documentation.

## AGENT D — Data Architecture Specialist

MODE: Read-only discovery initially.

Investigate all actual persistence technologies:

- Relational and nonrelational databases.
- ORM or query abstractions.
- Schemas and migrations.
- Entities and collection structures.
- Primary and foreign keys where applicable.
- Indexes.
- Query patterns.
- Transactions.
- Data ownership.
- Data lifecycle.
- Consistency models.
- Retention.
- Synchronization.
- Schema compatibility.
- Data validation.
- Migration and rollback mechanisms.

Distinguish observed schema from inferred logical relationships.

Deliver data architecture maps, storage ownership and domain links.

## AGENT E — Infrastructure and Operations Specialist

MODE: Read-only discovery initially.

Investigate:

- Cloud providers.
- Deployment configuration.
- Containers.
- CI/CD.
- Environment configuration.
- Infrastructure as code.
- Runtime topology.
- Network dependencies.
- Scaling strategies.
- Workers and schedulers.
- Logging.
- Monitoring.
- Alerting.
- Failure recovery.
- Backup and disaster recovery, if implemented.

Never reveal environment secret values.

Deliver verified infrastructure architecture and operational boundaries.

## AGENT F — Security Architect

MODE: Read-only discovery initially.

Investigate:

- Authentication.
- Authorization.
- Roles and permissions.
- Access boundaries.
- Identity propagation.
- Token and session lifecycle.
- Secret management.
- Cryptography usage.
- Input validation.
- Trust boundaries.
- Security middleware.
- Tenant isolation, if applicable.
- Data exposure.
- Audit controls.
- Sensitive operations.
- External integration security.

Document only controls actually supported by evidence.

If a concern is discovered, describe it separately as a finding; do not silently modify application behavior.

Deliver security architecture, critical invariants and cross-cutting links.

## AGENT G — Cache and Messaging Specialist

MODE: Read-only discovery initially.

Investigate:

- Caches.
- Redis or alternatives, if present.
- Key and namespace conventions.
- TTLs.
- Invalidation rules.
- Consistency expectations.
- Queue and stream mechanisms.
- Delivery semantics.
- Retries.
- Deduplication and idempotency.
- Ordering.
- Dead-letter handling.
- Concurrency.
- Consumers and producers.
- Scheduled jobs.

Cache and messaging may become separate root architectures if their responsibilities justify it.

Do not assume that cache storage and message delivery share the same semantics merely because they use the same technology.

## AGENT H — DDD Domain Analyst

MODE: Read-only discovery initially.

Investigate business capabilities across the entire application.

Do not infer domains solely from directory names.

Cross-reference:

- API operations.
- Business services.
- Front-end workflows.
- Persistence.
- Domain terminology.
- State machines.
- Events.
- Business rules.
- Integration boundaries.

Discover candidate bounded contexts and validate their boundaries with the other specialists.

Deliver:

- Domain inventory.
- Context map.
- Domain relationship classification.
- Core invariants.
- Candidate aggregates and entities.
- Critical workflows.
- Conflicting or ambiguous ownership.
- Proposed hierarchical documentation structure.

## AGENT I — Documentation Architect

MODE: Structural design and controlled writing.

Use the outputs of the investigation agents.

Responsibilities:

- Define the canonical documentation model.
- Normalize metadata.
- Define naming conventions.
- Design navigation hierarchy.
- Resolve duplicated ownership.
- Define cross-reference rules.
- Build the Main Entry and reusable templates.
- Coordinate documentation generation.
- Keep root documents compact.
- Ensure each architectural fact has a canonical owner.

Do not invent facts absent from specialist evidence.

## AGENT J — Validation and Consistency Auditor

MODE: Independent verification.

This agent should not simply trust the documentation creators.

Audit:

- Source-reference existence.
- Link validity.
- Coverage of major architectural areas.
- Missing bounded contexts.
- Contradictory descriptions.
- Duplicate canonical ownership.
- Misclassified facts.
- Incorrect DDD terminology.
- Undocumented high-impact implementation paths.
- Missing deprecation handling.
- Excessive root document size.
- Navigation completeness.
- Consistency between documentation and code.

Return actionable findings with severity, affected files and supporting evidence.

---

# 10. COORDINATION PHASES

Execute the work in the following phases.

## PHASE 0 — Preflight

1. Detect available tools and agent capabilities.
2. Detect the repository root.
3. Inspect existing instructions.
4. Inspect Git state.
5. Identify uncommitted user modifications.
6. Establish documentation ownership and safe writing boundaries.
7. Prepare an investigation coverage matrix.

Do not overwrite unrelated user changes.

## PHASE 1 — Independent discovery

Launch Agents A through H in parallel where supported.

Use read-only access.

Assign explicit source ownership to reduce duplicated investigation.

Allow cross-boundary source inspection when required, but record cross-domain findings.

Each agent must produce the standard investigation result contract.

## PHASE 2 — Cross-agent synthesis

Collect investigation results.

Identify:

- Architectural areas.
- Confirmed and candidate domains.
- Shared modules.
- Cross-cutting concerns.
- Critical dependencies.
- Documentation ownership conflicts.
- Missing evidence.

Resolve contradictions through targeted code reinspection.

Use targeted follow-up subagent assignments rather than restarting entire investigations.

## PHASE 3 — Documentation architecture

Agent I constructs:

- Main Entry.
- Global documentation contract.
- Canonical templates.
- Architecture index.
- Domain index.
- Documentation ownership map.
- Naming and linking conventions.
- Deprecation procedures.

Validate the structure before extensive documentation authoring.

## PHASE 4 — Documentation generation

Assign non-overlapping output paths.

Generate root architecture documents and their justified children.

Generate domain documents and their justified children.

Ensure all technical statements are evidence-based.

No two subagents may modify the same documentation file concurrently.

The coordinator owns shared indexes and merges.

## PHASE 5 — Cross-link integration

Link:

- Front-end modules to back-end contracts.
- Back-end modules to domains.
- Domains to persistence.
- Domains to other domains.
- Security rules to relevant implementation.
- Cache behavior to data ownership.
- Infrastructure to runtime components.
- Messaging to producers and consumers.
- Architectural decisions to affected components.

Avoid duplicating entire sections across linked documents.

## PHASE 6 — Automated validation

Generate or configure a portable validation mechanism under `AI/validation/`.

Prefer existing repository tooling.

Validate:

1. YAML metadata parsing.
2. Required fields.
3. Valid document types.
4. Unique stable IDs.
5. Relative Markdown links.
6. Source-path existence.
7. Navigation reachability.
8. Orphan documents.
9. Broken cross-references.
10. Canonical naming rules.
11. Deprecation archive integrity.
12. Changed-code documentation coverage.

Where possible, use Git diff to identify changed paths and map them to architectural owners.

A source-path-only validation is insufficient: shared libraries and cross-cutting changes may impact multiple owners.

Use an explicit ownership map with support for multiple impacted areas.

## PHASE 7 — Independent audit

Agent J reviews the entire generated documentation system.

Categorize findings as:

- BLOCKER
- HIGH
- MEDIUM
- LOW

Resolve all blockers and material correctness failures.

Do not hide unresolved uncertainty.

## PHASE 8 — End-to-end harness test

Simulate documentation navigation for representative tasks:

1. Front-end-only component change.
2. Backend API change.
3. Domain invariant change.
4. Database schema change.
5. Cross-cutting security change.
6. Cache invalidation change.
7. Creation of a new module.
8. Deprecation of an existing domain rule.
9. Multi-area feature modification.
10. Modification to an undocumented part of the system.

For each simulation verify:

- Correct initial architecture entry points.
- Correct traversal to leaf documents.
- Relevant domain context loaded.
- Irrelevant sibling documentation avoided.
- Required updates identified.
- Historical archive requirements detected.
- No broken references introduced.

Simulations must not modify production code.

Use temporary fixtures for destructive validation cases and clean them afterward.

## PHASE 9 — Final report

Report:

- Files created.
- Files updated.
- Discovered architecture.
- Discovered domains.
- Documentation coverage.
- Verified integration relationships.
- Unresolved architectural questions.
- Validation results.
- Risks.
- Recommended next documentation improvements.

Report only actions actually performed.

---

# 11. STANDARD INVESTIGATION CONTRACT

Every investigator must return the same structure:

```yaml
agent_id: 'agent-name'
scope: 'assigned-area'
status: 'complete|partial|blocked'

inspected_paths:
  - 'path'

verified_findings:
  - id: 'finding-id'
    statement: 'factual observation'
    evidence:
      - path: 'real/source/path'
        symbol: 'realSymbol'
    confidence: 'verified'

inferences:
  - id: 'inference-id'
    statement: 'reasoned conclusion'
    evidence:
      - path: 'real/source/path'
    validation_needed: 'what remains uncertain'

architecture_units:
  - id: 'stable-unit-id'
    name: 'unit-name'
    responsibility: 'description'
    source_paths:
      - 'path'
    depends_on:
      - 'other-unit-id'
    domains:
      - 'domain-id'
    suggested_doc: 'relative/document/path'

cross_area_impacts:
  - source_unit: 'unit-id'
    target_area: 'area'
    relation: 'description'

risks:
  - severity: 'high|medium|low'
    description: 'finding'

unknowns:
  - 'unresolved question'

suggested_documents:
  - path: 'target/path'
    reason: 'why separate documentation is justified'
````

All code references must be actual repository paths.

Do not fabricate paths to satisfy the schema.

If no evidence supports a field, use an empty collection or an explicitly unknown value.

---

# 12. WRITING RULES FOR ALL SUBAGENTS

Use concise, technical and unambiguous language.

Preferred:

"Controller X validates input Y, invokes Service Z and persists Entity W through Repository R."

Avoid:

"This module plays a very important role in ensuring robust and scalable functionality."

Preserve essential semantics:

- Responsibility.
- Behavior.
- Contracts.
- Invariants.
- Dependencies.
- Exceptions.
- Lifecycle.
- Source locations.

Avoid:

- Marketing language.
- Generic software-engineering explanations.
- Unverified best-practice claims.
- Full source file copies.
- Repeated definitions.
- Redundant introductions.
- Massive unstructured paragraphs.
- Unnecessary diagrams.
- Invented architectural patterns.

Use tables for stable mappings and relationships.

Use concise prose for behavioral explanations and business rules.

Use Mermaid only when a diagram materially improves comprehension.

Document system behavior as currently implemented, even if the implementation is architecturally imperfect.

Separate observed behavior from suggested improvements.

---

# 13. DOCUMENTATION COVERAGE AND TRACEABILITY

Build a traceable mapping between:

- Source files.
- Architectural units.
- Documentation documents.
- Domain ownership.
- Cross-cutting areas.

A source file may map to multiple architectural areas.

Avoid assuming that one directory equals one domain.

Maintain a lightweight, machine-readable ownership index where it improves validation.

It may be generated from document metadata.

Avoid maintaining two manually edited copies of the same mapping.

Track:

- Major implementation units investigated.
- Units with documented ownership.
- Unverified relationships.
- Broken references.
- Undocumented critical workflows.
- Documentation affected by source changes.

Never claim 100% semantic coverage merely because every source file matches a path pattern.

Coverage metrics indicate navigational completeness, not guaranteed correctness.

---

# 14. CHANGE INTEGRITY

When modifying existing documents:

1. Read the existing document.
2. Identify the smallest complete logical blocks becoming obsolete.
3. Capture their exact previous text.
4. Write an append-only historical entry.
5. Update the active document.
6. Update the relevant indexes and links.
7. Verify the historical capture.
8. Check for references to removed behavior.
9. Run the validation mechanism.

When several areas change in the same operation, apply this workflow independently to each affected document.

Prefer atomic updates or staged changes where possible.

If the operation fails midway, restore consistency or report the exact incomplete state.

Do not leave the active document updated while required historical material has been lost.

---

# 15. COMPLETION CRITERIA

The mission is complete only when:

- `AGENTS.md` points to the Main Entry.
- Main Entry defines mandatory pre-change and post-change procedures.
- Root architecture documents represent the actual application.
- Domains are discovered and documented using DDD analysis.
- Detailed modules are linked from their parents.
- Cross-domain relationships are navigable.
- Deprecation procedures preserve exact prior documentation.
- New areas can be added without changing the global harness design.
- The validation mechanism can detect relevant structural violations.
- Independent audit has been executed.
- End-to-end navigation has been tested.
- No blocking consistency defects remain.
- No undocumented assumptions are presented as facts.
- Production application behavior has not been modified.

The system must remain maintainable by future agents that were not involved in the initial documentation process.

---

# 16. EXECUTION DIRECTIVE

Begin by examining the repository, existing instructions and available agent capabilities.

Do not write generic architecture descriptions before investigating the application.

Perform discovery first, synthesis second, documentation generation third and independent validation last.

Use parallel subagents when they provide real context isolation and speed benefits.

Do not launch unnecessary subagents for trivial tasks.

Maintain explicit ownership of output files.

Preserve user changes.

Generate the actual files and validation assets inside the repository.

Complete the work in the current execution environment to the extent supported by available tools.

If a capability is unavailable, use the specified fallback and report the limitation.

Do not claim that any validation, investigation, file write or subagent execution occurred unless it actually occurred.

**START THE REPOSITORY DISCOVERY AND ARCHITECTURE HARNESS BOOTSTRAP.**

# HARNESS AMENDMENT — ENGLISH CONVENTIONS AND MANDATORY BRANCH REVIEW

This amendment supersedes conflicting sections of the previous Architecture-Driven Multi-Agent Harness specification.

Implement the following changes as mandatory requirements during the initial repository bootstrap.

## 1. Correct English Is Mandatory

Update `AI/main-entry.md` and `AGENTS.md` to include this permanent instruction:

### Language and Naming Policy

All AI-authored technical documentation, architectural descriptions, internal agent instructions, skill definitions, newly created identifiers, file names, directory names, and code comments MUST use grammatically correct, technically precise English.

This rule applies regardless of the language used by the user.

If a user provides a misspelled English term, incorrect technical expression, inconsistent naming convention, or nonstandard English phrasing, agents MUST silently normalize it to correct English when creating new artifacts.

For example:

- `Arquitecture` → `Architecture`
- `front-end-arquitecture.md` → `front-end-architecture.md`
- `back-end-arquitecture.md` → `back-end-architecture.md`
- `data-base-arquitecture.md` → `database-architecture.md`
- `infra-arquitecture.md` → `infrastructure-architecture.md`

Do not preserve spelling mistakes merely because they appeared in the user's request.

### Critical Exceptions

Do not silently rename:

- Existing public API fields.
- Existing database columns.
- Existing domain identifiers.
- External integration contracts.
- Established framework conventions.
- Runtime configuration keys.
- Legacy filenames referenced by the application.
- Any identifier whose spelling is necessary for compatibility.

Never break a working contract for linguistic consistency.

Treat language normalization as a documentation and new-artifact convention, not authorization to refactor existing code.

When a legacy identifier is incorrect, preserve its exact spelling in technical references and use the correct English term in explanatory prose.

User-facing conversational responses should follow the user's preferred language. This English-only requirement applies to persistent repository artifacts, not necessarily to chat responses.

---

## 2. Mandatory Branch Review Skill

Create the skill:

`AI/skills/branch-review/SKILL.md`

Its canonical name MUST be:

`branch-review`

Its purpose is to independently audit every relevant commit before its contents are pushed to a remote repository.

The skill must validate correspondence between:

1. Actual code changes.
2. Current architectural documentation.
3. DDD domain documentation.
4. Deprecated documentation archives.
5. Related documentation dependencies.
6. Existing architectural invariants and contracts.

The reviewing agent must operate independently of the agent that implemented the changes.

It must not accept the implementing agent's completion report as evidence of correctness.

---

## 3. Main Entry Integration

Add the following mandatory section to `AI/main-entry.md`.

### Mandatory Commit and Push Integrity

Every change to application code must be evaluated for architectural documentation impact.

Before committing:

- Identify changed architectural responsibilities.
- Verify that affected documentation is consistent with the staged implementation.
- Detect documentation that became obsolete.
- Ensure obsolete documentation is preserved in the corresponding append-only deprecation archive.
- Validate the integrity of modified documentation and cross-references.

Before every push:

- Invoke the `branch-review` skill.
- Compare all relevant outgoing commits against their parent states.
- Independently inspect the affected implementation.
- Validate that each commit preserves architecture-documentation integrity.
- Validate that the resulting branch state is consistent.
- Detect undocumented changes and inaccurate documentation.
- Invoke additional specialized review subagents when justified by the scope or complexity of changes.

No push may proceed while the mandatory branch review reports blocking violations.

A successful review is valid only for the exact reviewed Git state.

If the outgoing commits change after approval, the previous approval becomes invalid.

An unchanged, previously approved outgoing commit range may reuse a verifiable review result.

A push with no outgoing commits does not require a new semantic review, but must still pass applicable lightweight checks.

### Enforcement

Do not rely exclusively on natural-language instructions.

Implement:

- A lightweight `pre-commit` structural validator.
- A mandatory `pre-push` review gate.
- A matching CI validation workflow.
- Review result records bound to exact Git commit hashes.
- Fail-closed behavior when required verification cannot be completed.

Do not mark a review as successful if its subagent process failed, was unavailable, timed out, or returned incomplete evidence.

---

## 4. Review Scope and Git Semantics

The `branch-review` coordinator MUST determine the exact outgoing Git references and commits using the push context.

Use the reference information supplied to the `pre-push` hook, including local and remote references where available.

Support:

- Branch pushes.
- Multiple pushed references.
- First-time branch pushes.
- Updates to existing remote branches.
- Merge commits.
- Rebases and rewritten local history.
- Deleted references.

A deleted reference has no outgoing implementation state to document; validate it separately as a reference operation.

For new branches, determine the comparison baseline using reliable repository history. If a safe comparison baseline cannot be established, use a conservative review scope rather than arbitrarily assuming a branch name.

Do not blindly use `HEAD~1`, the most recent commit, or the current branch name as the complete review scope.

Inspect every outgoing commit as needed to verify history integrity.

Also examine the final combined branch state to detect inconsistencies that individual commit inspection might miss.

For commits that modify implementation and documentation together, compare their resulting state against the appropriate parent state.

Ensure the current documentation accurately describes the implementation as of that commit.

If a commit introduces deprecated behavior without including its archival documentation, treat it as a violation of commit-level integrity.

Report that specific commit as requiring correction.

---

## 5. Adaptive Multi-Agent Review

The `branch-review` skill must support adaptive delegation.

Use one coordinator agent and dynamically select specialized reviewers according to actual architectural impact.

Potential reviewers:

- Front-end Reviewer.
- Back-end Reviewer.
- Database Reviewer.
- DDD Domain Reviewer.
- Infrastructure Reviewer.
- Security Reviewer.
- Cache and Messaging Reviewer.
- Documentation History Reviewer.
- Cross-Area Consistency Reviewer.

The coordinator must not automatically launch all reviewers.

### Initial Delegation Policy

Use these thresholds as configurable heuristics, not fixed measures of correctness.

**Small change**

Typical characteristics:

- One architectural area.
- One cohesive module.
- Limited changed-file count.
- No critical domain invariant or public contract change.

Execution:

- One independent reviewer.
- Deterministic validations.

**Medium change**

Typical characteristics:

- Multiple modules.
- Two or more affected architectural areas.
- Material API, persistence, or domain interactions.

Execution:

- Two or three specialized reviewers when their responsibilities are distinct.
- One coordinator to integrate findings.

**Large or high-risk change**

Typical characteristics:

- Several architectural areas.
- Major domain changes.
- Schema or migration changes.
- Security-sensitive behavior.
- External contract changes.
- Broad refactoring.
- Changes to core architecture or agent instructions.

Execution:

- Multiple relevant specialized reviewers in parallel.
- Cross-area integration review.
- Independent documentation-history validation.

Security-sensitive changes may require a dedicated reviewer even when the diff is small.

Large diffs do not automatically require every possible reviewer.

The coordinator must prioritize semantic risk and architectural boundaries over raw line count.

---

## 6. Required Review Workflow

### Stage A — Deterministic Discovery

Run without LLM reasoning where possible:

1. Identify outgoing commits.
2. Collect commit diffs.
3. Identify changed source files.
4. Identify changed documentation files.
5. Extract affected architectural owners.
6. Detect deleted or renamed files.
7. Identify affected domain relationships.
8. Check documentation metadata.
9. Verify relative links.
10. Verify source references.
11. Check archive append-only integrity.

Produce a machine-readable review manifest.

### Stage B — Documentation Navigation

For every affected area:

1. Read its root architecture document.
2. Follow relevant documentation links.
3. Read the smallest appropriate leaf documents.
4. Read related bounded-context documentation.
5. Read applicable cross-cutting architecture documents.
6. Inspect the actual changed code and relevant call sites.

Never validate a complex code change only by comparing filenames or keyword similarity.

### Stage C — Semantic Consistency

Reviewers MUST determine whether documentation reflects actual behavior.

Verify:

- Responsibilities.
- Contracts.
- Inputs and outputs.
- Domain invariants.
- State transitions.
- Persistence behavior.
- Error handling.
- Dependencies.
- Security rules.
- Cache behavior.
- Event and messaging semantics.
- Cross-domain effects.

Identify documentation that is technically present but inaccurate, obsolete, misleading, or incomplete.

Mark conclusions as VERIFIED, INFERRED, or UNKNOWN.

A semantic PASS requires sufficient evidence for all critical affected behavior.

### Stage D — Deprecation Audit

For every removed or changed architectural statement:

1. Recover the exact previous Markdown from the relevant Git parent version.
2. Determine whether the statement was replaced, removed, or merely relocated without semantic change.
3. Compare the previous content against the corresponding `deprecate-*` archive.
4. Verify the complete obsolete logical block was preserved.
5. Verify date, reason, source, replacement and applicable commit reference.
6. Verify prior archive entries were not modified.
7. Verify active documentation no longer states obsolete behavior as current.

Do not archive unchanged material merely because it moved to a different file.

Do not summarize archived material.

Use byte-exact content comparison where feasible. If only part of a document changed, compare the original complete logical section with the archived block.

### Stage E — Independent Findings

Every reviewer returns:

```yaml
reviewer: 'reviewer-name'
scope: []
status: 'PASS|FAIL|INCONCLUSIVE'
reviewed_commits: []
findings:
  - severity: 'BLOCKER|HIGH|MEDIUM|LOW'
    type: 'documentation|deprecation|domain|contract|other'
    code_evidence: []
    documentation_evidence: []
    description: ''
    expected_correction: ''
unresolved_questions: []
```

Every blocking finding must identify verifiable evidence.

Do not treat stylistic disagreement as a semantic documentation failure unless it violates the agreed documentation contract.

### Stage F — Final Decision

The coordinator aggregates reviewer results.

Return one of:

- `PASS`
- `FAIL`
- `INCONCLUSIVE`

PASS:
All mandatory validations completed and no blocking violations remain.

FAIL:
At least one confirmed blocking inconsistency exists.

INCONCLUSIVE:
Required validation could not establish correctness.

Both FAIL and INCONCLUSIVE must block the push.

---

## 7. Repair Mode

The default `branch-review` operation is READ-ONLY.

It must never silently modify application code or rewrite Git history.

If documentation problems are found, create a structured repair plan.

Support an explicitly enabled repair mode:

`branch-review --repair`

In repair mode:

1. Determine the documentation changes required.
2. Restore missing archival entries from the correct Git history.
3. Update active documentation to match verified implementation.
4. Repair documentation links and metadata.
5. Preserve all existing historical archive entries.
6. Avoid changing production application code.
7. Run the independent validation again.

Important:

A `pre-push` hook MUST NOT silently amend existing commits or rewrite user history.

If repairs are made after commits already exist, report the working-tree modifications and require the developer or implementing agent to stage and commit or amend them explicitly.

Previously published commits must not be rewritten automatically.

If the policy requires documentation to be correct in each individual commit, repairing only the branch tip is insufficient.

In such cases, block the push and explain which historical commit must be corrected.

The repair process must preserve uncommitted user changes and avoid overwriting concurrent edits.

---

## 8. Pre-Commit and Pre-Push Integration

Create version-controlled Git hook entry points under:

`AI/hooks/`

The installer must configure or safely integrate them with the repository's existing hook configuration.

Do not overwrite existing hooks without inspecting them.

### Pre-commit

Purpose: fast, deterministic integrity checks.

Use staged content as the source of the proposed commit, not merely working-tree files.

Check:

- Documentation metadata.
- Broken references.
- Historical archive modification.
- Missing required architectural documentation references.
- Structural consistency.

Avoid expensive full-repository LLM investigations at this stage.

### Pre-push

Purpose: independent semantic audit.

Run the `branch-review` skill through the actual configured agent runtime.

A Git hook cannot invoke an LLM merely by referencing its Markdown skill.

Implement a supported invocation adapter using installed tools and documented interfaces.

Do not invent nonexistent Codex CLI flags or subagent APIs.

The adapter must:

- Identify the outgoing commits.
- Launch the review coordinator.
- Supply the review manifest.
- Delegate specialist reviews when supported.
- Collect structured results.
- Validate result completeness.
- Return an appropriate process exit code.

Use nonzero exit codes for FAIL and INCONCLUSIVE.

Prevent recursion if the review process itself invokes Git operations.

Provide actionable error messages.

---

## 9. Review Approval and Invalidation

Each successful review should produce a machine-readable approval record containing:

- Repository identity.
- Review schema version.
- Skill version or hash.
- Architecture-contract version or hash.
- Outgoing references.
- Exact commit hashes.
- Relevant documentation hashes.
- Review timestamp.
- Reviewed architectural areas.
- Reviewer identities or roles.
- Validation results.
- Final decision.

Approval records are local execution artifacts unless explicitly required elsewhere.

Do not unnecessarily commit transient approval records.

A prior PASS can be reused only if all relevant inputs remain identical and the record is verifiable.

Changing the code, documentation, review policy, or outgoing commit set invalidates cached approval as appropriate.

Do not treat an easily edited local JSON file as a secure authorization mechanism.

For protected branches, rely on independently executed CI checks and branch protection for authoritative enforcement.

---

## 10. CI Enforcement

Implement CI checks using the repository's existing CI provider where possible.

For every relevant pull request or protected-branch update:

- Validate architecture metadata and links.
- Validate source ownership mapping.
- Validate append-only deprecation history.
- Identify undocumented source changes.
- Re-evaluate documentation consistency.
- Reject invalid historical archive modifications.

If a trusted LLM review runtime is available in CI, execute semantic review there.

Otherwise, run deterministic checks in CI and clearly identify semantic validation as requiring a separately configured agent runtime.

Do not falsely claim that regular CI can perform complete semantic analysis without an appropriate agent or equivalent verification mechanism.

Require successful checks through repository branch protection or rulesets when available.

---

## 11. Skill Packaging

Keep `SKILL.md` concise.

It must contain:

- YAML frontmatter.
- Skill purpose.
- Invocation conditions.
- Essential review workflow.
- Required review outcomes.
- References to detailed procedures.

Move the expanded review protocol to:

`AI/skills/branch-review/references/review-protocol.md`

Move the structured reporting contract to:

`AI/skills/branch-review/references/review-result-schema.md`

Place deterministic validation utilities under:

`AI/skills/branch-review/scripts/`

Use progressive disclosure so the skill does not load its entire review specification for unrelated tasks.

Make the skill discoverable by the selected AI coding environment without duplicating its canonical implementation.

---

## 12. Bootstrap Validation

Extend the initial multi-agent harness bootstrap with a dedicated `Branch Review Engineer` responsible for implementing this skill, its hook adapter and review validation scripts.

After implementation, independently test:

1. A valid documentation-only commit.
2. A code change with accurate documentation.
3. A code change with missing documentation.
4. A code change with inaccurate documentation.
5. A deprecated rule missing its historical archive.
6. A modified historical archive.
7. A valid archive containing exact original content.
8. A large cross-domain feature.
9. Multiple outgoing commits.
10. A previously committed inconsistency corrected only at branch tip.
11. A review timeout or unavailable agent runtime.
12. A changed branch state after previous approval.
13. A review that requires multiple specialized subagents.
14. An attempt to push without valid approval.
15. A review with existing uncommitted user changes.

All tests must run on isolated fixtures or disposable Git repositories where destructive operations are necessary.

Never rewrite actual user history to test hook behavior.

Acceptance criteria:

- Correct English naming is enforced for newly authored artifacts.
- Existing compatibility-sensitive identifiers remain intact.
- The Main Entry includes mandatory branch-review obligations.
- The branch-review skill exists and is discoverable.
- The Git hook actually invokes the configured review mechanism.
- Multi-agent delegation is supported when the runtime permits it.
- Incorrect documentation blocks the push.
- Missing deprecations block the push.
- Modified historical archives block the push.
- Incomplete review blocks the push.
- Successful reviews are bound to exact Git states.
- CI provides independent enforcement wherever configured.

Do not report this amendment as complete until these capabilities have been implemented and tested to the extent supported by the repository and its execution environment.

END OF AMENDMENT.

## Mandatory Atomic Commit Integrity

**Every commit MUST represent a consistent, independently verifiable state of both application code and architectural documentation.**

Code changes, corresponding architecture documentation updates, and required deprecation records MUST be included in the **same Git commit**.

### Required Commit Contract

1. Every implementation change MUST be evaluated against the relevant architecture and domain documentation.
2. Any affected documentation MUST be updated before the implementation change is committed.
3. Any removed or replaced architectural documentation MUST be preserved in its corresponding append-only `deprecate-*` archive within the same commit.
4. A commit MUST NOT introduce code that contradicts its resulting architectural documentation.
5. A commit MUST NOT depend on a subsequent commit to correct missing documentation or deprecation history.
6. Documentation-only commits are permitted, provided their content accurately reflects the implementation at that commit.
7. Every outgoing commit MUST be individually validated by the `branch-review` skill before push.

### Mandatory Development Sequence

**READ → ANALYZE → IMPLEMENT → DOCUMENT → ARCHIVE → VALIDATE → COMMIT → BRANCH-REVIEW → PUSH**

- **READ:** Load the Main Entry, relevant architecture documents, and applicable domain documentation.
- **ANALYZE:** Identify architectural and cross-domain impacts.
- **IMPLEMENT:** Apply the requested source-code changes.
- **DOCUMENT:** Synchronize all affected architecture and domain documents with the implementation.
- **ARCHIVE:** Preserve the exact superseded documentation in the appropriate append-only deprecation archive.
- **VALIDATE:** Verify code behavior, documentation consistency, links, and historical integrity.
- **COMMIT:** Commit the implementation, documentation, and deprecation records together.
- **BRANCH-REVIEW:** Independently audit every outgoing commit and the resulting branch state, invoking specialized review subagents according to impact.
- **PUSH:** Allow the push only after the complete review has returned PASS.

### Strict Enforcement

The `branch-review` skill MUST reject any outgoing commit in which:

- Implementation and architectural documentation are inconsistent.
- Required documentation changes are missing.
- Superseded documentation was not archived.
- Historical archive content was modified or deleted.
- Documentation corrections appear only in subsequent commits.
- Required independent verification is incomplete.

**No agent is authorized to bypass these requirements.**

### No Automatic History Rewriting

The `branch-review` skill operates in read-only mode by default.

It MUST NOT automatically amend commits, rebase branches, rewrite Git history, or modify production code.

If an existing commit violates the integrity contract, the reviewer MUST block the push and identify the affected commit and required corrections.

A separate, explicitly authorized repair operation may prepare documentation fixes. Any commit rewriting must remain an explicit developer-approved action.

After corrections, the entire affected outgoing commit range MUST be reviewed again.

**A successful branch-level final state does not excuse an inconsistent intermediate commit.**

Execute the complete specification provided above as one unified task.

The second specification overrides conflicting rules from the first, and the final "Mandatory Atomic Commit Integrity" section takes precedence over all previous commit and review instructions.

Before implementation, consolidate these requirements internally into a single consistent execution contract.

Do not implement competing versions of the same rule. Do not omit any requirements that are not explicitly superseded.

Then begin repository discovery, subagent orchestration, documentation generation, branch-review implementation, and validation.
