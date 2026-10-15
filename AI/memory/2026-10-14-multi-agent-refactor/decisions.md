---
name: decisions
description: Decisions of this session with their reasons.
type: memory
area: memory
session: 2026-10-14-multi-agent-refactor
agent: orchestrator
status: active
---

# Decisions of session 2026-10-14-multi-agent-refactor

Append only. To change a decision, add a new one with `Supersedes`.

Related: [[AI/memory/2026-10-14-multi-agent-refactor/index]]: Hub of session 2026-10-14-multi-agent-refactor: goal, participants and links to state, decisions and logs.

## D1

2026-10-14 · decided by: owner · The data layer uses the Repository pattern and our own drivers. No ORM.

- Reason: not recorded in the summary. Ask the owner if you need it.
- Supersedes: none.

## D2

2026-10-14 · decided by: owner · Config options are in database tables. The API exposes them, and the front end edits them.

- Reason: it replaces the hardcoded `metadata.ts` catalog (bd checkpoint-9md).
- Supersedes: none.

## D3

2026-10-14 · decided by: owner · No commit, push or merge unless the owner asks.

- Reason: the conservative Beads profile in `AGENTS.md`.
- Supersedes: none.

## D4

2026-10-14 · decided by: orchestrator · Security fixes (checkpoint-0bn) and Zod wiring (checkpoint-1xc) start after slice 2 lands.

- Reason: the fixes change the data layer that slice 2 rewrites (bd descriptions).
- Supersedes: none.

## D5

2026-10-14 · decided by: owner · The orchestrator is the owner's main Claude Code session. Hermes was removed later the same day (owner request).

- Reason: new owner requirement. The `AGENTS.md` section "Orchestration" replaces "Hermes orchestration".
- Supersedes: the old `AGENTS.md` text "Hermes only orchestrates".

## D6

2026-10-14 · decided by: owner · ASD-STE100 Simplified Technical English is the supreme style rule for all agents, files, notes and replies.

- Reason: simplicity and clear communication. Replies to the owner are in Portuguese with the same principles.
- Supersedes: none.

## D7

2026-10-14 · decided by: owner · Session memory lives in `AI/memory/<YYYY-MM-DD>-<slug>/`, with one writer for each file.

- Reason: the orchestrator can compact or clear its context and continue from files. See [[AI/memory/research]].
- Supersedes: none.

## D8

2026-10-14 · decided by: owner · Skills and tools policy in `AGENTS.md`: the orchestrator picks skills for each task. Ponytail and one Matt Pocock skill are mandatory for every agent.

- Reason: the same quality process for all models and providers, with real evidence in each report.
- Supersedes: the old `AGENTS.md` section "Skill discovery and selection".
