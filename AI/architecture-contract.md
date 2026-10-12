# Architecture documentation contract

Version: 1

## Authority and naming

Implementation is the source of truth for current behavior. Tests, configuration, migrations, and existing prose are supporting evidence. Reconcile contradictions against executable call sites; record unresolved questions. Use VERIFIED, INFERRED, and UNKNOWN explicitly. Never infer deployed state from local files.

Canonical current documents live in `AI/Architecture/`; history lives in `AI/Deprecate/`. Use correct English for all newly authored artifacts. Preserve compatibility-sensitive API fields, database identifiers, framework conventions, configuration keys, and existing application filenames.

## Schema policy

Every current architecture document has valid YAML frontmatter with `id`, `title`, `type`, `area`, `status`, `owner`, `last_verified`, `source_paths`, `related_domains`, and `tags`. Allowed types: `architecture-root`, `module`, `component`, `integration`. Status is `active`. The date records actual source inspection. IDs remain stable across moves.

Architecture documents include all ten numbered sections in [the template](documentation-template.md); use `N/A` where inapplicable. Domain documents use the fourteen sections in [the domain template](domain-template.md), metadata `id`, `title`, `type: domain`, `status`, `classification`, `last_verified`, `source_paths`, and `related_domains`. Classification is `core`, `supporting`, `generic`, or `unknown`. Indexes are navigation maps and do not require these sections. Templates and investigation artifacts are exempt from active-document schema.

Use existing repository paths for source references and relative Markdown links for navigation. Include symbols where practical. Explain contracts, invariants, failure behavior, state ownership, lifecycle, and dependency direction. Keep each fact in one canonical document; reference it from other areas. No credentials or sensitive environment values.

## Navigation and ownership

Read main entry, area roots, relevant module/leaf documents, and affected domain branches in that order. Follow each relevant branch to the deepest useful level; avoid unrelated siblings. Main entry should stay under 200 lines and area roots under 150 where practical.

Create a leaf for a cohesive responsibility with critical rules, multiple interacting components, reusable contracts, or significant operations. Do not create a document for every DTO or function. Register new areas in the architecture index and parent maps. Maintain [ownership.json](validation/ownership.json) as the explicit source-to-document impact map, including cross-cutting owners and domain links. Source metadata provides evidence, not a second manually edited impact map.

## Change and history integrity

READ → ANALYZE → IMPLEMENT → DOCUMENT → ARCHIVE → VALIDATE → COMMIT → BRANCH-REVIEW → PUSH.

Each commit must independently contain consistent implementation, documentation, and required history. If implementation changes no documented fact, verify the relevant documentation and record the verification rather than rewriting timestamps. A later repair cannot legitimize an inconsistent intermediate commit.

Before replacing an architectural fact, preserve the exact complete previous logical block using [the deprecation template](deprecation-template.md). Archive a retired document in full. Append entries only; never change, delete, reorder, or summarize previous history. Preserve original Markdown and line endings. Use a sufficiently long fence if historical text contains fences. Do not archive unchanged relocations or fabricate history for previously undocumented code. Archive first, update active content second, and validate exact historical correspondence.

## Enforcement and limitations

Pre-commit validates the index snapshot, not working-tree substitutes. Pre-push derives outgoing commits from Git's supplied reference lines, reviews every commit and merge parent as needed, and reviews final pushed states. Semantic reviewers must independently inspect source, documentation, and obsolete logical blocks. PASS requires complete evidence; FAIL and INCONCLUSIVE block push.

Local cached approval is an execution artifact tied to exact inputs, not a secure authorization mechanism. Hooks can be bypassed locally; authoritative enforcement requires independent CI and remote branch protection. Deterministic CI cannot establish semantic correctness without a separately configured trusted agent runtime. Review is read-only by default. Explicit repair may prepare safe documentation changes but never rewrite user history or production code.
