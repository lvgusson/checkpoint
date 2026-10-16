---
name: e2e-route-map
description: Route map table of steps, actions and request timings for end-to-end testing.
type: reference
area: frontend
---

# End-to-end route map

This route map defines the fixed sequence to click every path of the web application.
Playwright runs this sequence in `apps/web/e2e/route-map.spec.ts`.
Each step reads request timings from `window.__timings` and writes them to `apps/web/test-results/route-map-timings.json`.

## Steps table

| Id                | Route            | Action                                        | Expected result                                                      | Timing to read                             |
| ----------------- | ---------------- | --------------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------ |
| `login-view`      | `/login`         | Open the login page                           | The login form displays email, password and submit inputs            | `GET /api/v1/config`                       |
| `login-submit`    | `/login`         | Submit credentials from environment variables | The application signs in and redirects to the home route             | None (Supabase call)                       |
| `theme-toggle`    | `/jogos`         | Click the theme toggle button in the header   | The application changes the color theme and update label             | None (client state)                        |
| `library-view`    | `/jogos`         | Open the game library page                    | The grid displays game cards and catalog statistics                  | `GET /api/v1/catalog`, `GET /api/v1/games` |
| `library-filters` | `/jogos`         | Enter search text and choose filter values    | The grid updates with filtered results and count                     | `GET /api/v1/games`                        |
| `library-scroll`  | `/jogos`         | Scroll to the bottom of the page              | The application loads and appends the next page of games             | `GET /api/v1/games`                        |
| `detail-modal`    | `/jogos`         | Click a game card in the list                 | The modal opens with scores; the dialog has focus, not `modal-close` | `GET /api/v1/games/:id`                    |
| `game-edit`       | `/jogos/:id`     | Edit notes, save, and restore original value  | The game saves changes and restores verified original data           | `PATCH /api/v1/games/:id`                  |
| `queue-view`      | `/ordem`         | Open the queue page                           | The recommended game queue displays ranked items                     | `GET /api/v1/lists/:id/recommendations`    |
| `wishlist-view`   | `/desejos`       | Open the wishlist page                        | The wishlist displays game items and prices                          | `GET /api/v1/wishlist`                     |
| `settings-view`   | `/configuracoes` | Open the settings page                        | The screen displays scoring rules, weights and filters               | `GET /api/v1/lists/:id/settings/scoring`   |

## Environment variables

- `BASE_URL`: Base URL of the web server. Default: `http://localhost:5173`.
- `E2E_EMAIL`: Account email for authenticated tests. If unset, the runner skips authenticated steps.
- `E2E_PASSWORD`: Account password for authenticated tests. If unset, the runner skips authenticated steps.
- `VERCEL_AUTOMATION_BYPASS_SECRET`: Secret token for Vercel deployment protection bypass.
- Fallback: when variables are unset, the runner reads `{ email, password, bypassSecret }` from `playwrite-credentials.json` at the repo root. The file is git-ignored. Never print, open, or commit it.

## Running against preview deployments

Run the route map against a protected Vercel preview deployment:

```bash
BASE_URL=<preview url> pnpm --filter @checkpoint/web exec playwright test route-map.spec.ts
```

When `BASE_URL` is set to a non-local URL and a bypass secret exists (from `VERCEL_AUTOMATION_BYPASS_SECRET` or the `bypassSecret` field in `playwrite-credentials.json`), the context sends:

- `x-vercel-protection-bypass: <secret>`
- `x-vercel-set-bypass-cookie: true`

Rules:

- Never send bypass headers when `BASE_URL` is localhost.
- Never log the secret or include it in URLs, traces, or reports.
- Agents must NOT run authenticated steps against preview or production; the orchestrator runs them.
- Agents run only `playwright test --list` and `pnpm check`.

## Data safety rule

The notes edit is the single allowed write operation.
Register cleanup before the first write.
Read the existing notes before saving any modification.
Cleanup has its own timeout and restores original notes via API or fresh page.
Verify the persisted value and fail loudly if it differs from the original.
Never print original notes content (print length only).
Queue checks are read-only: never release, delete, or reorder pins.
Never delete existing games or list records.

## Known pitfalls

- Never assert on a bare `getByRole('status')`. Many components render `role=status` (save bar, prerequisite search, loaders). Use `detail-save-status` for the detail save message.
- Playwright restarts the worker after a failed test. The shared page and login session are lost, so later screens fail with "heading not found" or "Target page closed". Fix the first failure; the later failures are fallout.

## Related

- [[AI/frontend/testid-map]]: Stable test IDs and destructive actions for every application screen.

- [[AI/frontend/e2e-testing]]: How to run and write Playwright browser smoke tests.
- [[AI/frontend/frontend]]: Folder map of apps/web and the map of frontend notes.
