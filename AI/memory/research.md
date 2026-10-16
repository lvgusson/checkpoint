---
name: research
description: Why session memory uses one-writer append-only files and a short state note, with the sources checked on 2026-10-14.
type: explanation
area: memory
---

# Why is session memory designed this way?

This note records research from 2026-10-14. External source details are historical and are not revalidated in the repository audit.

The design uses files, links and one existing hook type. It has no daemon, no database and no new dependency. Anthropic documentation was sufficient for most decisions. One targeted check of other tools was necessary for parallel writers. Academic papers and forum threads were not consulted.

## Historical sources and choices

| Source (fetched 2026-10-14)                                                                                        | What it says                                                                                                                                                    | What we adopted                                                                                                   |
| ------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| [Claude Code memory](https://code.claude.com/docs/en/memory)                                                       | Auto memory loads only the first 200 lines or 25KB of `MEMORY.md`. Topic files load on demand. Project-root `CLAUDE.md` is re-read after `/compact`.            | A short `state.md` with links to detail. Session state stays out of auto memory, because teammates cannot see it. |
| [Context window](https://code.claude.com/docs/en/context-window)                                                   | After compaction, SessionStart hooks with the `compact` source run, and their output goes into the compacted context. Hook context added earlier is summarized. | Not built. The SessionStart hook runs `bd prime` only; the agent reads `state.md` itself.                         |
| [Hooks reference](https://code.claude.com/docs/en/hooks)                                                           | PreCompact can only block compaction. PostCompact cannot change the result. SessionStart sources are `startup`, `resume`, `clear`, `compact` and `fork`.        | No PreCompact or PostCompact hook.                                                                                |
| [Subagents](https://code.claude.com/docs/en/sub-agents)                                                            | A subagent starts with a fresh context. It gets `CLAUDE.md` but not the parent's auto memory. Only its final report returns.                                    | The orchestrator gives each worker a log path in the task prompt.                                                 |
| [Memory tool](https://platform.claude.com/docs/en/agents-and-tools/tool-use/memory-tool)                           | "ASSUME INTERRUPTION". A progress log is read at the start of each session and updated at the end.                                                              | Write entries at each milestone, not only at the end. Read state first.                                           |
| [Effective context engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents) | Structured note-taking outside the context window. Compaction keeps decisions and unresolved bugs. Subagents return 1,000 to 2,000 token summaries.             | The keep-list in the compaction steps. A small recall budget.                                                     |
| [Multi-agent research system](https://www.anthropic.com/engineering/multi-agent-research-system)                   | The lead agent saves its plan to memory. Subagents store work outside and pass "lightweight references" back.                                                   | Logs hold the detail. Reports and state hold links.                                                               |
| [Long-running agent harnesses](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents)  | A progress file and git history restore state. Agents declare victory too early.                                                                                | `done` needs a check command and its exit code.                                                                   |
| [Cline Memory Bank](https://docs.cline.bot/prompting/cline-memory-bank)                                            | Files such as `activeContext.md` and `progress.md` are read at the start of every task. No rule for parallel writers.                                           | The idea of one current-state file. We rejected "read all files every time" because it costs too many tokens.     |
| [claude-code issue #24130](https://github.com/anthropics/claude-code/issues/24130)                                 | A shared `MEMORY.md` loses writes with parallel agents. It proposes locks, append-only logs or per-agent files.                                                 | Per-writer append-only files. No locks, because a crashed agent can keep a lock.                                  |

## Trade-offs

- Append-only logs grow. The cap on `state.md`, not on logs, controls the recall cost.
- Only the orchestrator writes `state.md`. A worker's news is visible only after the next compaction. This delay is accepted, because it prevents conflicts.
- Session folders are working state. They expire. Durable lessons go into normal `AI/` notes.

## Related

- [[AI/memory/memory]]: Hub of session memory: when to use it, the notes, the sessions.
- [[AI/memory/session-format]]: Layout, file types, frontmatter, naming, ownership, templates and the worker paragraph for a session memory folder.
