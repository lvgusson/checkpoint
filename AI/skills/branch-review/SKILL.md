---
name: branch-review
description: Independently audit every outgoing Git commit, architecture documentation, exact deprecation history, and final pushed state before push; prepare documentation repairs only when explicitly requested.
---

# Branch review

Read [the project entry](../../main-entry.md) and [the review protocol](references/review-protocol.md). Review is read-only unless the user explicitly requests `--repair`. Do not amend, rebase, stage, commit, push, or change application code as part of this skill.

Git pre-push invokes `node AI/skills/branch-review/scripts/branch-review.mjs --pre-push` with Git's four-field reference lines on stdin. Manual review requires explicit `--base HASH --head HASH`. Never guess a baseline from `HEAD~1`. The gate independently launches native Codex sessions for the coordinator and each affected architecture/domain specialist. Each session reads exact Git objects, including every merge parent. Missing runtime, timeout, invalid evidence, FAIL, and INCONCLUSIVE block push.

Read [the result contract](references/review-result-schema.md) when producing or interpreting a review. Local PASS is evidence for exact input hashes, not remote authorization. Deterministic CI validates structural/history integrity; trusted semantic CI requires an independently configured runtime and protected branches.

For explicit repair, read the repair section in the protocol. Prepare a structured plan, then execute `node AI/skills/branch-review/scripts/branch-review.mjs --repair --plan PATH`. Preserve dirty and concurrent user changes. A documentation repair at the tip cannot legitimize an inconsistent earlier commit.
