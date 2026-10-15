# Checkpoint: agent guide

Shared instructions for every coding agent. Claude Code loads this through `CLAUDE.md`.

## Supreme rule: Simplified Technical English

This rule applies to all agents, models and providers. It has priority over all other style rules. "ASD TSE100" means ASD-STE100 Simplified Technical English ([asd-ste100.org](https://asd-ste100.org/about_STE.html)).

- Use STE for every reply to the owner, every `.md` file that you write or change, and every memory note.
- Write the result first.
- Write one idea in each sentence. Use a maximum of 20 words in a procedure step and 25 words in a description.
- Use the active voice and the simple present tense.
- Use one word for one meaning. Do not use filler words, idioms or jargon without a definition.
- Use numbered steps for procedures and lists for items.
- STE is an English standard: files and notes stay in English. The owner writes in Portuguese. Reply in Portuguese with the same principles: short, plain, result first.

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
pnpm check                          # required gate: run before you report a task done
pnpm --filter <package> <script>    # run one package's script, e.g. pnpm --filter web test
```

<!-- TODO(maintainers): add dev server, single-test and codegen commands. Agents cannot guess these. -->

## Knowledge base (`AI/`)

`AI/` is an Obsidian vault at the repo root. A link `[[AI/foo]]` means the file `AI/foo.md`.

1. Before changing code, open `AI/index.md` and follow the link for the area you will touch.
2. Read the one note that answers your task: a how-to for creating things, a reference for facts.
   Follow its `## Related` links only when that note is not enough.
3. If a note contradicts the code, trust the code and fix the note in the same change.

## Workflow

1. Pick work: `bd ready`, then `bd update <id> --claim`.
2. Read the matching `AI/` note (above).
3. Make the change.
4. Run `pnpm check`. It must pass. Report the command and its result, not just "done".
5. Update the knowledge graph (below).
6. Close out per the Beads "Session Completion" section at the end of this file.

## Where knowledge goes

| You learned...                                      | Put it in                            |
| --------------------------------------------------- | ------------------------------------ |
| How the codebase works, a convention, a how-to      | An `AI/` note (team-reviewed in PRs) |
| Work still to do, a bug, a follow-up                | `bd create`                          |
| A short operational fact future agent sessions need | `bd remember`                        |

## No stray files

Never create `.md` files outside `AI/` (orchestration config under `.agents/` is the one exception). Reports, smoke-test results, roadmaps, run summaries and reproduction commands are not files: put them in your final message to the user.

- Durable knowledge for future agents goes in an `AI/` note (edit an existing one first, see "Where knowledge goes").
- Task state goes in `bd`. Run logs go in `.agents/logs/`, which is not committed.
- Allowed root docs: `README.md`, `AGENTS.md`, `CLAUDE.md`. Any other new `.md` outside `AI/` needs an explicit user request.

## Grow the knowledge graph

Keep `AI/` connected, small and true. Full rules and the note template: `AI/documentation-rules.md`.

- Edit an existing note when it already answers the same question.
- Create a new note when the question or note type differs, or the existing note passes 150 lines.
- Link both ways: link the new note from its hub, and end it with a `## Related` section.

## Engineering Skills & Quality Policy

All coding agents, including Claude Code, Codex and Antigravity, must follow these engineering standards.

### Skills and tools policy

1. The orchestrator chooses the skills for each task and writes them in the task prompt. It does not ask the owner.
2. Every agent, model and provider loads these skills in every task:
   - Ponytail `ponytail` before a code or file change, and `ponytail-review` before it reports code done. A read-only audit loads only `ponytail-audit`.
   - The Matt Pocock skill for the task type (table below). After a code change, also `code-review` before it reports done.
   - Only Ponytail and Matt Pocock skills. Other skills are not part of this policy. Each skill costs context.
   - Keep only the name and description of a skill in context. Read the body of a `SKILL.md` only when the task needs it.
   - Ponytail does not inject its rules by itself: `PONYTAIL_DEFAULT_MODE=off` and `PONYTAIL_MAP=0` are set in `.claude/settings.json` and `.agents/orchestrate.sh`.
3. Invoke a skill with the Skill tool. If your tool does not have the skill, read its file and follow it:
   - Ponytail: `~/.claude/plugins/marketplaces/ponytail/skills/<name>/SKILL.md` (Claude plugin `ponytail@ponytail` 5.2.0). Codex and agy use their own Ponytail install.
   - Matt Pocock: `.agents/skills/<name>/SKILL.md`.
   - If a skill is not installed for you, tell the orchestrator.
4. Each report shows the evidence in "Skill usage evidence". The orchestrator rejects a report without "Skills invoked".
5. The orchestrator uses these tools when they give a gain:
   - Beads for every task: `bd create` before work, `bd update <id> --claim`, notes with the result, `bd close <id> --reason`. Each worker claims its own issue.
   - Serena for symbol-shaped code work (see "Serena MCP Usage").

| Task type                         | Matt Pocock skill    |
| --------------------------------- | -------------------- |
| New behavior, or a fix with tests | `tdd`                |
| Bug                               | `diagnosing-bugs`    |
| Structure, moves, interfaces      | `codebase-design`    |
| Vocabulary or ADR                 | `domain-modeling`    |
| A plan or a decision              | `grilling`           |
| An edit to `AGENTS.md` or a skill | `writing-for-agents` |

### Implementation standards

- Prefer the simplest correct implementation consistent with existing architecture.
- Preserve domain boundaries, type safety, security, and maintainability.
- Avoid creating generic abstractions without a concrete reuse requirement.
- Do not introduce new dependencies when existing tools adequately solve the problem.
- Do not invent requirements, tests, commands, files, or system behavior.
- Follow existing conventions unless a change is technically justified.
- Keep implementation and documentation proportional to the actual task.
- Prune: keep only real, used code. When you replace or move something, delete what became unused in the same change. This includes files, exports, CSS, dependencies and scripts. First prove with grep that nothing uses it. Keep migrations, seed data, tool config and anything you cannot prove dead. List them for the owner.

### Review and verification

Before reporting completion:

1. For a code change, run `ponytail-review` and `code-review` (see "Skills and tools policy").
2. Run `pnpm check` and the tests for the changed behavior.
3. Verify that the change satisfies the original requirements.
4. Confirm that documentation and referenced paths stay accurate.
5. Report failed checks and limits.

### Skill usage evidence

Every implementation report must identify:

- **Skills discovered:** the relevant skills available to you.
- **Skills invoked:** each skill with its real invocation: a Skill tool call, or the path of the file you read.
- **Plugin status:** the relevant plugins and hooks that you confirmed active.
- **Validation:** each command and its real result.
- **Limitations:** missing integrations or skills.

Report a skill as invoked only when a real call or file read shows it.

### Orchestration

The orchestrator is the owner's main Claude Code session. It plans, delegates, reviews and reports. Pane 0 of the tmux session is a plain shell for the owner. Workers are Claude subagents (Agent tool) and three interactive CLIs in tmux (`.agents/orchestrate.sh`): pane 1 `codex`, pane 2 `claude`, pane 3 `agy`.

Models on 2026-10-14. Sources: Claude Code system info, `claude --help`, the Codex model list and `agy models`. The tiers are the owner's policy, not a benchmark.

| Tool: model                                 | Strength (source)                               | Use it for                                         | Tier                    |
| ------------------------------------------- | ----------------------------------------------- | -------------------------------------------------- | ----------------------- |
| Claude: `opus` (`claude-opus-5-5`)          | Owner policy                                    | Advisor: review, plans, hard decisions             | Strong, slow, high cost |
| Claude: `sonnet` (`claude-sonnet-5-5`)      | Owner policy                                    | Orchestrator and implementation workers            | Medium                  |
| Claude: `haiku` (Agent tool alias)          | Owner policy                                    | Read-only audits and search                        | Weak, fast, low cost    |
| Claude: `fable` (`claude --help` alias)     | Not documented                                  | Not in the owner policy                            | Not rated               |
| Codex: `gpt-6.1-sol` (pane default)         | "Workhorse model for coding" (Codex model list) | Second opinion from the OpenAI family              | Not rated               |
| agy: `gemini-3.8-flash-high` (pane default) | Not documented by `agy models`                  | Second opinion from the Gemini family, test suites | Not rated               |

Decision rules:

- Do not delegate small edits, work with secrets or steps that need the owner's approval. Do them yourself.
- Claude subagent: a short task that is read-only or uses files no other worker owns. It sends back one report. Use Haiku for parallel audits.
- Codex: a second opinion, a security review, an independent re-implementation or a long autonomous task.
- agy: a task for a third model family, for example a test suite. `agy --help` does not document strengths, so do not assume them.
- Use panes 1 to 3. Open a new tmux pane or window only for a watched long task, an interactive CLI or isolation.
- Give each worker its files. Two workers never own the same file.
- The reviewer uses a different model from the author.

Pane protocol (touch panes only through `.agents/pane.sh`):

1. Write the task to a scratch file outside the repo, never a repo `.md`. Start with the standards, the files the worker owns, the acceptance check and the memory paragraph from [[AI/memory/session-format]]. End with: `When finished, print exactly "ORCH-DONE <agent>" alone on the last line.`
2. Run `pane.sh send <pane> <file>`, then `pane.sh wait <pane> <agent>`. Read progress with `pane.sh read <pane>`. Do not type into a pane while its agent works.
3. Review the real result, not the claim: `git diff`, the task check, and `pnpm check` when code changed.
4. If the result is wrong, send a fix request to the same pane. Say exactly what failed. If it is correct, reply "approved".
5. If a pane shows an approval, login or trust prompt, tell the owner and wait. Never approve for the owner.
6. Beads and the conservative Git policy apply to every worker.

Consolidation rule: when a process ends (subagent, pane worker or background command), tell the owner in the same turn. First run the check yourself. Use this template and no raw logs, unless the owner asks:

1. Result (Resultado): one sentence: done, failed or partial.
2. What changed (O que mudou): files and their count.
3. Checks (Verificações): the exact command and its exit code.
4. Problems and limits (Problemas e limites).
5. What you must decide (O que você decide), if anything.
6. Next step (Próximo passo).

### Serena MCP Usage

- Use Serena for symbol-shaped code work: impact analysis, moves, renames and deletions. Tools: `lsp.get_symbols_overview`, `lsp.find_symbol`, `lsp.find_referencing_symbols`, `lsp.rename_symbol`, `lsp.safe_delete_symbol`.
- Call `initial_instructions` first. It activates the project and gives the session id that some tools need.
- Use grep and Read for text, config and docs.
- Workers use Serena only if their tool has it.
- In your report, say if you used Serena and name the tools. Claim Serena use only when real tool calls show it.

## Git policy

Beads agent profile: **conservative**. Do not commit, push, or run Dolt remote sync unless the user asks in this session.

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
