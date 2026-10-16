---
name: session-format
description: Layout, file types, frontmatter, naming, ownership, templates and the worker paragraph for a session memory folder.
type: reference
area: memory
---

# What is in a session memory folder?

## Layout

```text
AI/memory/<YYYY-MM-DD>-<slug>/
├── index.md       session hub: goal, participants, links to every file
├── state.md       snapshot to read first after a context clear (max 60 lines)
├── decisions.md   append-only decisions with reasons
└── log-<writer>.md  append-only entries, one writer per file
```

- `<YYYY-MM-DD>` is the local date when the session starts. `<slug>` is a short kebab-case name. Never rename the folder.
- Date-first names sort the sessions by time.
- Questions and handoffs between agents are log entries. The orchestrator copies the open ones into `state.md`.

## Ownership

| File                  | Only writer                  | How it changes                  |
| --------------------- | ---------------------------- | ------------------------------- |
| `index.md`            | Orchestrator                 | Add one link for each new log   |
| `state.md`            | Orchestrator                 | Full rewrite at each compaction |
| `decisions.md`        | Orchestrator                 | Append only                     |
| `log-orchestrator.md` | Orchestrator                 | Append only                     |
| `log-<writer>.md`     | The writer named in the file | Append only                     |

- One file has one writer. This rule prevents lost writes when agents work in parallel.
- `state.md` and append-only files have a `Related:` line under the title, not a `## Related` section at the end.
- `<writer>` is the agent and the task, for example `codex-security-audit`, `sonnet-slice-2` or `haiku-audit-1`.
- The orchestrator picks the log name, links it from `index.md` and sends the name in the task.
- A read-only agent (for example Explore, Plan or a Haiku audit) cannot write files. It sends a report. The orchestrator records the report in `log-orchestrator.md`.
- After the writer adds its `done` entry, the orchestrator can set `status: compacted` in the log frontmatter. It never changes the entries.

## Frontmatter

Every file has `name`, `description`, `type: memory`, `area: memory`, `session`, `agent` and `status`.

- `status: active` while the file can change. `status: compacted` when its content is in `state.md` and nobody writes to it. `status: completed` for a finished session summary or hub. Archived working files use `status: compacted`.
- `state.md` also has `updated: <YYYY-MM-DD HH:MM ±zz>`.

## Entry IDs

- Log entry: a heading `## E<n>`, with `n` = previous number + 1. Link one entry with the path form `AI/memory/<session>/log-<writer>#E3` inside a wikilink.
- Decision: a heading `## D<n>`. Link it with the path form `AI/memory/<session>/decisions#D2` inside a wikilink.
- Never edit or delete an entry. To correct one, append a new entry that names the old ID.
- Times are local and have the offset: `2026-10-14 22:40 -03`. Beads shows UTC.

## Log entry template

```markdown
## E<n>

<YYYY-MM-DD HH:MM ±zz> · <progress|finding|question|handoff|blocked|done> · <one-line title>

- bd: <issue id or none>
- Files: `<path:line>`, ...
- Result: `<exact command>` exit <code>
- Next: <the next step, or "none">
- For: <orchestrator | writer of another log>, only for a question or handoff
```

Keep an entry at 12 lines or less. Do not paste long output. Write a summary and give the source (a bd id or a file path).

## Decision template

```markdown
## D<n>

<YYYY-MM-DD> · decided by: <owner|orchestrator> · <the decision in one sentence>

- Reason: <why>
- Supersedes: <D-id or none>
```

## State template

A `Related:` line goes under the title. Then these sections, in this order:

1. `Next step`.
2. `Blockers`.
3. `Work items`: a table with item, bd id, status and blocked by.
4. `Open handoffs and questions`, with links to their entries.
5. `Last check and files changed`: command, exit code, time, and files by work item.
6. `Decisions`: one short phrase for each `D<n>`.
7. `Sources compacted`: one line for each log, with the last compacted entry and the log status.

## Worker paragraph

The orchestrator puts this paragraph in each task. It replaces `<session>` and `<writer>`.

```text
Session memory: append your progress to AI/memory/<session>/log-<writer>.md.
If the file does not exist, create it with the frontmatter from AI/memory/session-format.md.
You are the only writer of that file. Do not change other files in AI/memory/.
Add one entry "## E<n>" for each finding, question, handoff, block, and when you finish.
Each entry has the time, the kind, the bd id and the files.
It also has the exact command, its exit code and the next step.
Never change an earlier entry. Write a new entry to correct it.
Your final message still contains your full report.
```

## Related

- [[AI/memory/memory]]: Hub of session memory: when to use it, the notes, the sessions.
- [[AI/memory/compaction]]: Steps to merge log entries into the state note and close a session.
- [[AI/memory/recall]]: Steps to recover the session state after a context clear or compaction.
