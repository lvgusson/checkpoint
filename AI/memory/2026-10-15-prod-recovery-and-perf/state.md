---
name: state
description: Handoff snapshot of 2026-10-15 for the next lead: next step, blockers, work items, rules and how to verify.
type: memory
area: memory
session: 2026-10-15-prod-recovery-and-perf
agent: orchestrator
status: active
---

# State

Related: [[AI/memory/2026-10-15-prod-recovery-and-perf/index]], [[.agents/orchestration]], [[AGENTS]]

## Next step

Tmux session `orch`: window `lead` is the new lead (agy, Claude Opus 5.5 high). Pane 3 is agy Gemini 3.8 Flash (finishes checkpoint-he2). Panes 1 and 2 (codex, claude) are closed: restart with `.agents/orchestrate.sh` pieces only when needed.

Update 14:20 (lead agy): `pnpm check` exit 0 (20 test files, 139 tests).

- `checkpoint-0j1`: closed (scored library cache per user+list with LRU cap).
- `checkpoint-4mw`: closed (scoring.ts quick wins: O(n+R) preference, shared Intl.Collator, linear max, golden snapshot).
- `checkpoint-3vo`: closed (packages/core: shared Intl.Collator, cached normalizeMetadata, O(1) Set permissions).
- `checkpoint-3i1`: closed (replaced @supabase/supabase-js with @supabase/auth-js in web app).
- `checkpoint-34o`: closed (browse/search filter+sort+paginate in SQL, not in memory).
- `checkpoint-ehg`: closed (wishlist add game lookup, patch() returns this.game() warming cache, consistent searchScores).
- `checkpoint-thu`: closed (batch Steam wishlist import with bounded concurrency cap 5).

## Work items

| Item                             | bd id (prefix checkpoint-) | Status                            |
| -------------------------------- | -------------------------- | --------------------------------- |
| Prod down, wrong DB password     | p91                        | closed; logged-in call not proven |
| Route map failure on preview     | he2                        | closed (test bug)                 |
| Loader and loading-state bug     | 7iv                        | closed                            |
| Tracking /api/v1/track           | gma                        | closed                            |
| DB time, Docker test DB          | 70n, gdk                   | closed                            |
| Perf SQL, cache, scoring, import | 0j1, 4mw, 3vo              | closed                            |
| Perf SQL browse/search           | 34o                        | closed                            |
| Perf wishlist / steam import     | ehg, thu, 3i1              | closed                            |

## Open handoffs and questions

- The DB password was pasted in chat. Advise a reset in Supabase, then the owner reruns `fix-db-url.sh`.

## Last check and files changed

- `pnpm check` exit 0 at commit `99523c2` (13 test files, 81 tests with the Docker DB). The loader work in the tree is not checked.
- Pushed: `homologacao` at `99523c2`. Preview: `https://checkpoint-o5ocomaz0-lucasgusson99-4673s-projects.vercel.app` (runs `99523c2`). Production: `https://gps.dev.br`.
- Preview check: `vercel curl <path> --deployment <url>`. Route map: `cd apps/web && BASE_URL=<url> pnpm exec playwright test route-map.spec.ts`.

## Rules the owner set

- Delegate first. Orchestrator routes and verifies ([[.agents/orchestration]]). Lead agents use subagents and name model and reasoning.
- Never open `playwrite-credentials.json` (git-ignored: email, password, bypassSecret). Tests read it. Never print secrets.
- Vercel secret writes: the owner runs them with `!`.
- Docker Engine lives in WSL (disk D:), never Docker Desktop. After a restart redo: `sudo setfacl -m u:lucas:rw /var/run/docker.sock`.
- Tests are Vitest; test DB is `pnpm db:up`. Push only to `homologacao`; production deploy needs owner approval.

## Decisions

- D1 browser-queue tracking. D2 Serena optional. D3 Docker in WSL.

## Sources compacted

- No logs yet. Prompts: `.agents/logs/handoff-2026-10-15/`.
