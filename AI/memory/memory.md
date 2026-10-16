---
name: memory
description: Hub of session memory: when to use it, the notes, the sessions.
type: hub
area: memory
---

# Session memory

Session memory is the working state of one multi-agent session. It is stored as linked files in `AI/memory/<YYYY-MM-DD>-<slug>/`. With it, the orchestrator can compact or clear its context and continue. Workers use it to give findings and handoffs to the orchestrator.

Use a session folder when more than one agent works on a task, or when the task needs more than one context window. Do not use one for a short single-agent task.

## Where knowledge goes

| Knowledge                                       | Store                                       | Life                       |
| ----------------------------------------------- | ------------------------------------------- | -------------------------- |
| Progress, findings and handoffs of this session | `AI/memory/<session>/`                      | Expires after the session  |
| Task status and remaining work                  | `bd` (source of truth)                      | Until closed               |
| A short operational fact for all sessions       | `bd remember`                               | Permanent                  |
| A convention, how-to or reason                  | A normal `AI/` note                         | Permanent, reviewed in PRs |
| Project knowledge                               | Never the Claude auto memory dir            | Not applicable             |
| Session or project state                        | Never Serena memories (`.serena/memories/`) | Not applicable             |

Session notes link bd ids. They do not copy issue text.

## Where to go

- [[AI/memory/recall]]: Steps to recover the session state after a context clear or compaction.
- [[AI/memory/session-format]]: Layout, file types, frontmatter, naming, ownership, templates and the worker paragraph for a session memory folder.
- [[AI/memory/compaction]]: Steps to merge log entries into the state note and close a session.
- [[AI/memory/research]]: Why session memory uses one-writer append-only files and a short state note, with the sources checked on 2026-10-14.

## Sessions

- [[AI/memory/2026-10-14-multi-agent-refactor/index]]: completed. Seven-slice refactor epic, security audit and memory system.
- [[AI/memory/2026-10-15-prod-recovery-and-perf/index]]: active. Production recovery, performance, tracking and the handoff to agy.

## Related

- [[AI/index]]: Entry point: pick the area you change and follow one link.
- [[AI/documentation-rules]]: When to edit or create an AI note, note types, frontmatter and linking rules.
