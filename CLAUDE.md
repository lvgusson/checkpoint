@AGENTS.md

## Claude Code only

- Beads context arrives through a SessionStart hook (`bd prime --hook-json`). If it is missing from your context, run `bd prime` once.
- Track tasks with `bd`, not the built-in task or todo tools.
- Knowledge: follow "Where knowledge goes" in AGENTS.md. Do not save project knowledge to auto memory; teammates cannot see it.
- Use plan mode before changing anything under `packages/core/`.
- A Stop hook runs `pnpm check` when `apps/` or `packages/` changes. If it blocks you, fix the cause; never weaken a check to make it pass.
- When compacting, keep: the bd issue id, the list of modified files, the last `pnpm check` result, and the `AI/` notes you edited.
