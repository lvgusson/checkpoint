# Orchestration (orchestrator only)

Only the orchestrator reads this file. A worker follows `AGENTS.md` and its task prompt.

The orchestrator is the owner's main Claude Code session. It plans, delegates, reviews and reports. Pane 0 of the tmux session is a plain shell for the owner. Workers are Claude subagents (Agent tool) and three interactive CLIs in tmux (`.agents/orchestrate.sh`): pane 1 `codex`, pane 2 `claude`, pane 3 `agy`.

Models on 2026-10-14. Sources: Claude Code system info, `claude --help`, the Codex model list and `agy models`. The tiers are the owner's policy, not a benchmark.

| Tool: model                                 | Strength (source)                               | Use it for                                                              | Tier                                |
| ------------------------------------------- | ----------------------------------------------- | ----------------------------------------------------------------------- | ----------------------------------- |
| Claude: `opus` (`claude-opus-5-5`)          | Owner policy                                    | Advisor: review, plans, hard decisions                                  | Strong, slow, high cost             |
| Claude: `sonnet` (`claude-sonnet-5-5`)      | Owner policy                                    | Orchestrator and implementation workers                                 | Medium                              |
| Claude: `haiku` (Agent tool alias)          | Owner policy                                    | Read-only audits and search                                             | Weak, fast, low cost                |
| Claude: `fable` (`claude --help` alias)     | Not documented                                  | Not in the owner policy                                                 | Not rated                           |
| Codex: `gpt-6.1-sol` (pane default)         | "Workhorse model for coding" (Codex model list) | Second opinion from the OpenAI family                                   | Strong, slow, high cost             |
| Codex: `gpt-5.6-terra`                      | "Balanced model for everyday work" (OpenAI)     | Routine coding, refactoring, implementation and code review             | Balanced, medium speed, medium cost |
| Codex: `gpt-6-luna`                         | "Fast and cost-efficient model" (OpenAI)        | Simple coding tasks, small fixes, boilerplate and repetitive operations | Lightweight, fast, very low cost    |
| agy: `gemini-3.8-flash-high` (pane default) | Not documented by `agy models`                  | Second opinion from the Gemini family, test suites                      | Medium, slow, zero cost             |

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

## Choose the tool and the model

Start all tmux agents first: run `.agents/orchestrate.sh`, then check each pane with `pane.sh read`. Delegate by these criteria:

1. Read-only audit, search or doc-drift check: Claude subagent `haiku`. Parallel is allowed.
2. Implementation in files that no other worker owns: Claude subagent or pane 2 `claude` with `sonnet`.
3. Database migration, SQL, security review or independent re-implementation: pane 1 `codex`.
4. Test suite, browser check or a third opinion: pane 3 `agy`.
5. Review of a change: use a different model from the author. Hard decision or plan: `opus` advisor.
6. Change under `packages/core/`: plan first, then both apps must be green.
7. Small edit, secret or owner approval: do it yourself.

A pane that shows an approval prompt stops. Tell the owner. Never approve for the owner.

## Release flow (staging first)

1. Agents push `feat/*` and open a pull request to `homologacao`. The owner approves and merges it. Never push to `homologacao` or `main` directly.
2. Read the Vercel preview URL of the merge to `homologacao` (`gh api repos/lvgusson/checkpoint/deployments`, then its statuses).
3. Open the URL. Check that the pages and `/api/v1/health` answer. Report each status code.
4. Merge to `main` only when the owner approves.

## Delegate first (owner order)

The orchestrator is the most expensive model. It routes and verifies. It does not do bulk work.

1. Send implementation, tests, migrations and refactors to pane 1 (`codex`) or pane 3 (`agy`). Do not start them yourself unless the owner asks.
2. In the task, tell the lead to use subagents and name the model and reasoning for each. Cheap model and low reasoning for mechanical work. Strong model and high reasoning for risky logic. Ask the lead to report the choice.
3. Codex models: `gpt-6.1-sol` (default workhorse), `gpt-6-astra` (frontier, hard problems), `gpt-6-luna` (fast, simple). Reasoning: low, medium, high, extra high.
4. Do these yourself only: a one-line fix, a decision, a secret, a push, and the final check.
5. A subagent owns files no other agent edits. Name them in the task.
6. Run `pnpm check` only when no agent is editing. Formatting warnings during work belong to the agent that is editing.
7. Staging URL: the preview needs the Vercel login. Use `vercel curl <path> --deployment <url>` for checks. A Playwright run needs the project bypass secret from the owner.
