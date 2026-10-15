---
name: log-opus-memory-system
description: Log of the opus-memory subagent: memory system, AGENTS.md rules, Codex findings copied from bd.
type: memory
area: memory
session: 2026-10-14-multi-agent-refactor
agent: opus-memory
status: active
---

# Log: opus-memory (memory system)

Related: [[AI/memory/2026-10-14-multi-agent-refactor/index]]: Hub of session 2026-10-14-multi-agent-refactor: goal, participants and links to state, decisions and logs.

## E1

2026-10-14 22:31 -03 · progress · Session memory system created

- bd: none
- Files: `AI/memory/memory.md`, `AI/memory/session-format.md`, `AI/memory/recall.md`, `AI/memory/compaction.md`, `AI/memory/research.md`, this session folder
- Result: not checked yet. See E5.
- Next: AGENTS.md rules, then checks.

## E2

2026-10-14 22:31 -03 · finding · Codex security audit, copied from the bd checkpoint-0bn notes

- bd: checkpoint-0bn. Read-only audit before the refactor. No critical finding. No SQL injection path.
- S1 high: the JSON store has no per-user ownership. Fix: refuse the JSON store for authenticated multi-user mode (`setup.ts:67`, `repository.ts:61`, `list-repository.ts:65`).
- S2 medium: no per-user limits or concurrency caps on import, refresh and recommend (`wishlist.ts:182,235`, `steam.ts:218`, `scoring.ts:395`).
- S3 medium: the legacy-auth rate limit trusts the first `X-Forwarded-For`, and its map has no hard cap (`server.ts:122`, `auth.ts:140`, `rate-limit.ts:8`).
- S4 medium: RLS lets users UPDATE `app_user.id` (`003_rls.sql:96,131`, `app-user.ts:47`). Fix: revoke table UPDATE, grant only profile columns.
- S5 low: the Steam profile id is not validated or encoded (`steam.ts:108,317`).
- Also: the logger does not mask a generic `?key=` (`logger.ts:15-47`). These line numbers are from before slice 2. Some files are now deleted.
- Next: fix after slice 2 (decision D4). The full Codex text was in a scratchpad file outside the repo, so it is not durable.

## E3

2026-10-14 22:31 -03 · finding · Facts corrected against the orchestrator's summary

- Slice 6 (checkpoint-0xi) is closed. The "Comprei" button moved to a slice 4 follow-up. No bd issue holds it.
- `apps/api/src/validation/` and `apps/api/test/security/` now exist. Only files in `validation/` import the Zod schemas. They are not wired.
- Slice 2 (checkpoint-6a8): the worker reports done, but the pg driver has not run on a real Postgres. A second worker does that.
- bd has no epic and no dependency links. bd shows checkpoint-3r7 as ready.
- checkpoint-gbm (tmux rework, "Hermes drives") is in progress. The summary did not name it.
- Tmux pane 0 runs `hermes`. Hermes config default model: `claude-haiku-4-5-20251001`.
- bd shows UTC dates (2026-10-15). The local session date is 2026-10-14 (-03).
- Next: none.

## E4

2026-10-14 22:31 -03 · progress · AGENTS.md: supreme rule and orchestration

- bd: none
- Files: `AGENTS.md` (new "Supreme rule" section, "Hermes orchestration" replaced by "Orchestration"), `AI/documentation-rules.md`, `AI/index.md`
- Result: see E5.
- Next: the orchestrator decides on the proposed hook and the `CLAUDE.md` text (in the final report).
- For: orchestrator. `.agents/orchestrate.sh`, `.agents/ORCHESTRATION-CONTRACT.md` and bd checkpoint-gbm still say that Hermes orchestrates.

## E5

2026-10-14 22:38 -03 · done · Checks and recall test

- bd: none
- Result: `pnpm exec prettier --check AGENTS.md AI/` exit 0. The link check in [[AI/memory/compaction]] prints `0 broken`.
- Result: `pnpm check` exit 1 at 22:34. Typecheck and lint pass. Prettier fails only on `apps/api/test/security/helper.ts` (1xc, agy). Build did not run.
- Recall test: grep, then `state.md` (58 lines, 3.4 KB), then only E2 (13 lines, 1.2 KB). That is about 1,150 tokens. Both test questions had answers.
- The test is not blind: the same agent wrote the files.
- Next: the orchestrator decides on the proposed SessionStart hook and the `CLAUDE.md` text.

## E6

2026-10-14 22:50 -03 · progress · AGENTS.md: skills and tools policy (D8)

- bd: none
- Files: `AGENTS.md` sections "Skills and tools policy", "Implementation standards", "Review and verification", "Skill usage evidence", "Serena MCP Usage"
- Result: `pnpm exec prettier --check AGENTS.md AI/` exit 0. The STE checks report no sentence over the limit in the changed sections.
- Verified: the Ponytail skill files and the 7 Matt Pocock skill files exist. Serena tool names come from `initial_instructions`.
- Next: none.
