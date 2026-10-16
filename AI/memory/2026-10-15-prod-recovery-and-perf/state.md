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
| Game fixes (purchase, scroll)    | ad7                        | in progress, uncommitted       |

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
