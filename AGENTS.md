# Checkpoint: agent guide

Shared instructions for every coding agent. Claude Code loads this through `CLAUDE.md`.

## Supreme rule: Simplified Technical English

ASD-STE100 ([asd-ste100.org](https://asd-ste100.org/about_STE.html)) applies to all agents, models and providers.

- Write the result first. One idea per sentence (max 20 words in a procedure step, 25 in a description).
- Use active voice and simple present tense.
- Use one word for one meaning. Do not use filler words, idioms or undefined jargon.
- Use numbered steps for procedures and bullet lists for items.
- Files and notes in English. Reply to owner in Portuguese with same principles.

## Map

| Path                | What it is              | Rule                                                   |
| ------------------- | ----------------------- | ------------------------------------------------------ |
| `apps/api`          | Node API                |                                                        |
| `apps/web`          | React app               |                                                        |
| `packages/core`     | Domain contracts        | Used by both apps: a change here needs both apps green |
| `packages/ui-react` | Product-agnostic UI kit | Never import from `apps/*`                             |

## Commands

```bash
pnpm install                        # after pulling or changing any package.json
pnpm test                           # all Vitest tests; DB tests skip until pnpm db:up
pnpm db:up                          # throwaway Postgres in Docker (db:down stops it): AI/backend/testing
pnpm check                          # required gate: run before you report a task done
pnpm --filter <package> <script>    # run one package's script, e.g. pnpm --filter web test
```

## Knowledge base (`AI/`)

`AI/` is an Obsidian vault at repo root (`[[AI/foo]]` = `AI/foo.md`). Open `AI/index.md` before changing code. Read the one note that answers your task (follow `## Related` only if needed). If a note contradicts code, trust code and fix the note in the same change.

## Workflow

1. Pick work: `bd ready`, then `bd update <id> --claim`.
2. Load the skills now, before you read or edit any file (see "Skills and tools policy"):
   - Ponytail: `ponytail`.
   - Matt Pocock: the skill for your task type (table in the policy), for example `tdd` or `diagnosing-bugs`.
   - Your tool has no Skill tool: read the `SKILL.md` file at the path in the policy and follow it.
3. Read the matching `AI/` note (above).
4. Make the change.
5. Run `ponytail-review` and `code-review` (code changes only).
6. Run `pnpm check`. It must pass. Report the command and its result, not just "done".
7. Update the knowledge graph (below).
8. Close out per the Beads "Session Completion" section at the end of this file.

## Where knowledge goes

| You learned...                                      | Put it in                            |
| --------------------------------------------------- | ------------------------------------ |
| How the codebase works, a convention, a how-to      | An `AI/` note (team-reviewed in PRs) |
| Work still to do, a bug, a follow-up                | `bd create`                          |
| A short operational fact future agent sessions need | `bd remember`                        |

## No stray files

Never create `.md` files outside `AI/` (except `.agents/` orchestration and root `README.md`, `AGENTS.md`, `CLAUDE.md`). Reports and summaries belong in your final message, not in files. Task state goes in `bd`. Keep `AI/` connected (`AI/documentation-rules.md`): edit existing notes first, keep under 150 lines, and link both ways.

## Role

Worker by default (ignore `.agents/orchestration.md`). Orchestrator only when specified: read `.agents/orchestration.md`, use `.agents/orchestrate.sh` and `.agents/pane.sh`.

## Skills and tools policy

Load skills in Workflow step 2 before reading or editing files (tool call or read `SKILL.md`):

- Ponytail: `~/.claude/plugins/marketplaces/ponytail/skills/<name>/SKILL.md` (`ponytail` before changes, `ponytail-review` before reporting code done, `ponytail-audit` for read-only audits).
- Matt Pocock: `.agents/skills/<name>/SKILL.md`. Load the skill for your task type (table below). Run `code-review` after code changes before reporting done.

| Task type                         | Matt Pocock skill    |
| --------------------------------- | -------------------- |
| New behavior, or a fix with tests | `tdd`                |
| Bug                               | `diagnosing-bugs`    |
| Structure, moves, interfaces      | `codebase-design`    |
| Vocabulary or ADR                 | `domain-modeling`    |
| A plan or a decision              | `grilling`           |
| An edit to `AGENTS.md` or a skill | `writing-for-agents` |

- Implementation standards: before writing or editing code, follow [[AI/agent-reference#Implementation standards]].
- Review and evidence: before completing your report, format evidence per [[AI/agent-reference#Skill usage evidence]].
- Serena MCP (optional): helps only for symbol work (rename, move, delete with references); do not use for text, config, SQL, or docs; see [[AI/agent-reference#Serena MCP]].

## Git policy

Flow: `feat/*` → pull request → `homologacao` → `main`. The owner reviews and merges every pull request.

1. Work in a git worktree on branch `feat/<bd-id>-<slug>`, created from `origin/homologacao`.
2. Commit and push only `feat/*` branches.
3. Run `pnpm check` green, then open the pull request: `gh pr create --base homologacao` (body per the `pr` skill).
4. Leave `homologacao` and `main` to the owner: no merge, no push, no force, no reset.
5. Run Dolt remote sync only when the user asks in this session.

<!-- BEGIN BEADS INTEGRATION v:1 profile:minimal hash:46cd31e7 -->

## Beads Issue Tracker

This project uses **bd (beads)** for issue tracking. Run `bd prime` to see full workflow context and commands.

### Quick Reference

```bash
bd ready              # Find available work
bd show <id>          # View issue details
bd update <id> --claim  # Claim work
bd close <id>         # Complete work
```

### Rules

- Use `bd` for ALL task tracking — do NOT use TodoWrite, TaskCreate, or markdown TODO lists
- Run `bd prime` for detailed command reference and session close protocol
- Use `bd remember` for persistent knowledge — do NOT use MEMORY.md files

**Architecture in one line:** issues live in a local Dolt DB; sync uses `refs/dolt/data` on your git remote; `.beads/issues.jsonl` is a passive export. See https://github.com/gastownhall/beads/blob/main/docs/core-concepts/sync-concepts.md for details and anti-patterns.

## Agent Context Profiles

The managed Beads block is task-tracking guidance, not permission to override repository, user, or orchestrator instructions.

- **Conservative (default)**: Use `bd` for task tracking. Do not run git commits, git pushes, or Dolt remote sync unless explicitly asked. At handoff, report changed files, validation, and suggested next commands.
- **Minimal**: Keep tool instruction files as pointers to `bd prime`; use the same conservative git policy unless active instructions say otherwise.
- **Team-maintainer**: Only when the repository explicitly opts in, agents may close beads, run quality gates, commit, and push as part of session close. A current "do not commit" or "do not push" instruction still wins.

## Session Completion

This protocol applies when ending a Beads implementation workflow. It is subordinate to explicit user, repository, and orchestrator instructions.

1. **File issues for remaining work** - Create beads for anything that needs follow-up
2. **Run quality gates** (if code changed) - Tests, linters, builds
3. **Update issue status** - Close finished work, update in-progress items
4. **Handle git/sync by active profile**:
   ```bash
   # Conservative/minimal/default: report status and proposed commands; wait for approval.
   git status

   # Team-maintainer opt-in only, unless current instructions forbid it:
   git pull --rebase
   bd dolt push
   git push
   git status
   ```
5. **Hand off** - Summarize changes, validation, issue status, and any blocked sync/commit/push step

**Critical rules:**

- Explicit user or orchestrator instructions override this Beads block.
- Do not commit or push without clear authority from the active profile or the current user request.
- If a required sync or push is blocked, stop and report the exact command and error.

<!-- END BEADS INTEGRATION -->
