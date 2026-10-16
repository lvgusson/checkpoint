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

Related: [[AI/memory/2026-10-15-prod-recovery-and-perf/index]], `.agents/orchestration.md`, [[AGENTS]]

## Next step

1. Verify Vercel preview deployment runtime connection: `PATCH /api/v1/games/:id` timed out during E2E cleanup. Ensure `DATABASE_URL` in Vercel matches current pooler credentials.
2. Re-run route map against preview after Vercel finishes building the latest `homologacao` commit:
   `cd apps/web && BASE_URL=https://checkpoint-git-homologacao-lucasgusson99-4673s-projects.vercel.app pnpm exec playwright test route-map.spec.ts`
3. Open pull request to merge `homologacao` into `main` after owner verification.

Update 14:50 (lead agy):

- Quality gate: `pnpm check` exit 0 (20 test files, 139 tests, build success).
- Supabase migrations: applied `20261015120000_indexes.sql`, `20261015130000_audit_columns.sql`, `20261015140000_user_track.sql` to remote Supabase (exit 0).
- Dolt sync: `bd dolt push` exit 0.
- Git: pushed `homologacao` at `b8e33cd`.

## Work items

| Item                             | bd id (prefix checkpoint-) | Status                         |
| -------------------------------- | -------------------------- | ------------------------------ |
| Prod down, wrong DB password     | p91                        | closed                         |
| Route map failure on preview     | he2                        | closed (test + selector fixed) |
| Loader and loading-state bug     | 7iv                        | closed                         |
| Tracking /api/v1/track           | gma                        | closed                         |
| DB time, Docker test DB          | 70n, gdk                   | closed                         |
| Perf SQL, cache, scoring, import | 0j1, 4mw, 3vo              | closed                         |
| Perf SQL browse/search           | 34o                        | closed                         |
| Perf wishlist / steam import     | ehg, thu, 3i1              | closed                         |
| Game fixes (purchase, scroll)    | ad7                        | closed (PR #1 merged)          |

## Open handoffs and questions

- The DB password was pasted in chat. Owner should reset it in Supabase, then rerun `fix-db-url.sh` and update Vercel environment variables.
- Direct API `PATCH /api/v1/games/:id` timed out on Vercel preview serverless function during E2E test; verify Vercel database connectivity.

## Last check and files changed

- `pnpm check` exit 0 at commit `b8e33cd` (20 test files, 139 tests with Docker DB).
- Pushed: `homologacao` at `b8e33cd`.
- Preview URL: `https://checkpoint-git-homologacao-lucasgusson99-4673s-projects.vercel.app`.

## Rules the owner set

- Delegate first. Orchestrator routes and verifies (`.agents/orchestration.md`). Lead agents use subagents and name model and reasoning.
- Never open `playwrite-credentials.json` (git-ignored: email, password, bypassSecret). Tests read it. Never print secrets.
- Vercel secret writes: the owner runs them with `!`.
- Docker Engine lives in WSL (disk D:), never Docker Desktop. After a restart redo: `sudo setfacl -m u:lucas:rw /var/run/docker.sock`.
- Tests are Vitest; test DB is `pnpm db:up`. Push only to `homologacao`; production deploy needs owner approval.

## Decisions

- D1 browser-queue tracking. D2 Serena optional. D3 Docker in WSL.

## Sources compacted

- No logs yet. Prompts: `.agents/logs/handoff-2026-10-15/`.

## Handoff 2026-10-15 (Claude to next agent)

Update 2026-10-16: other agents work on s5f, afc, 4bq, tests and the DB timeout. Results are not yet recorded here. Check `bd show <id>` for each.

- `homologacao` is at `2015a26` (PR #1 merged: ad7 game fixes). Vercel preview succeeded for `checkpoint` and `checkpoint-v2`. Bd issue `checkpoint-ad7` is closed.
- Playwright ran against the homologacao preview (sha 2015a26, 2026-10-15 21:3x): FAILED. route-map 4-7 and smoke login tests fail, game-fixes test 2 (`loader-modal` still visible after 5 s; passed timing only if raised) and test 1 (library cards not found, flaky) fail. Cause not yet found; not a verified regression (no baseline run). `main` merge NOT done.
- Old note: Playwright against the homologacao preview. Run `pnpm --filter @checkpoint/web exec playwright test e2e/game-fixes.spec.ts e2e/route-map.spec.ts` with the homologacao URL (`https://checkpoint-git-homologacao-lucasgusson99-4673s-projects.vercel.app`, bypass headers per `AI/frontend/e2e-testing.md`). Use long timeouts: Supabase latency is about 200 ms.
- NOT DONE: `main` still lags `homologacao`. The owner decides the PR `homologacao` to `main` after e2e passes.
- Fastify refactor (bd `checkpoint-4bq`, open): done in worktree `~/.local/state/checkpoint-worktrees/fastify`, branch `worktree-agent-ad854d122fd031225`, uncommitted. It branches from `main`, not `homologacao`: rebase first. `pnpm check` and security tests passed there. Not tested on Vercel (`app.server.emit` entry). axios not adopted on purpose (one `fetch` call).
- Known gaps: no unit tests for `useInfiniteScroll`, `gameWriter.purchase`, the `scoring` cover fallback. Queue and Wishlist pass `isLoading: false`, so a tall screen may not reload.
