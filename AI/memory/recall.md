---
name: recall
description: Steps to recover the session state after a context clear or compaction, with a token budget.
type: how-to
area: memory
---

# How do I recover the session state after a context clear?

Budget: about 2,000 tokens before you read code. Read only the files in these steps.

1. Find the active session. Run `rg -l '^status: active' AI/memory/*/index.md`. If none exists, use `bd ready` and current instructions.
2. If several sessions are active, use the session named in your task. Otherwise, confirm the session with the owner.
3. Read `AI/memory/<session>/state.md` first. It is 60 lines or less. The SessionStart hook runs `bd prime`. It does not print `state.md`, so read the file.
4. Stop when `state.md` answers your question. Most questions stop here.
5. If you need a detail, follow the one link in `state.md` that names it, for example `log-codex-security-audit#E2`. Read only that entry.
6. Read `index.md` only when you need a file that `state.md` does not link.
7. Do not read a log with `status: compacted` unless you need its raw detail. `state.md` already contains its content.
8. Compare `state.md` with live sources before you act:
   - `bd show <id>` for the status of each work item. Beads has priority.
   - `git status --short` for changed files. Git has priority.
9. If `state.md` is wrong, do not fix the fact in your head. Tell the orchestrator, or write a `finding` entry in your own log.

Check: you can name the next step, its blocker and its bd id, and you read 3 files or fewer.

## Related

- [[AI/memory/memory]]: Hub of session memory: when to use it, the notes, the sessions.
- [[AI/memory/session-format]]: Layout, file types, frontmatter, naming, ownership, templates and the worker paragraph for a session memory folder.
- [[AI/memory/compaction]]: Steps to merge log entries into the state note and close a session.
