---
name: e2e-testing
description: Run and write the Playwright browser smoke tests of apps/web.
type: how-to
area: frontend
---

# How to run and write E2E tests (Playwright)

The tests live in `apps/web/e2e/` and are not part of `pnpm check`. Playwright and its scripts are already in `apps/web/package.json`.

## Run

1. Once per machine, download the browser: `pnpm --filter @checkpoint/web exec playwright install`.
2. WSL/Linux only, once, as root: `cd apps/web && sudo pnpm exec playwright install-deps`. Without it the browser fails with `libnspr4.so: cannot open shared object file`.
3. `pnpm --filter @checkpoint/web test:e2e` runs everything. Add `-- smoke.spec.ts` for one file or `-- --headed` to watch.
4. `test:e2e:ui` (time-travel UI) and `test:e2e:debug` (Inspector) help with a failing test.
5. Check: the run ends with all tests passed. The HTML report is `apps/web/playwright-report/` (ignored by git).
6. Run against Vercel preview: `BASE_URL=<preview url> pnpm --filter @checkpoint/web exec playwright test route-map.spec.ts`. Uses `VERCEL_AUTOMATION_BYPASS_SECRET` or `bypassSecret` in `playwrite-credentials.json`. Agents do NOT run authenticated steps against preview or production; the orchestrator runs them.

## What the setup does

| Fact     | Value                                                                             |
| -------- | --------------------------------------------------------------------------------- |
| Config   | `apps/web/playwright.config.js`                                                   |
| Browser  | Chromium only                                                                     |
| Base URL | `http://localhost:5173`; Playwright starts `pnpm dev` and reuses a running server |
| Retries  | 2 and one worker when `CI` is set, none locally                                   |

## Write a test

1. Add `apps/web/e2e/<feature>.spec.ts`, one file per feature area.
2. Query by what the user sees: `getByRole`, `getByLabel`, `getByPlaceholder`. Do not invent selectors, and avoid CSS and `data-testid`.
3. Wait on the condition (`expect(...).toBeVisible()`, `page.waitForURL`), never on a fixed delay.
4. Provide credentials for authenticated tests with `E2E_EMAIL` and `E2E_PASSWORD`, or git-ignored `playwrite-credentials.json` (`{ email, password, bypassSecret }`). The API at `http://127.0.0.1:3000` is optional for smoke checks; filter its network errors when asserting "no JavaScript errors".
5. Check: the new test passes twice in a row.

## Current coverage

`smoke.spec.ts` has five tests that check structure without login: login page, navigation shell, Portuguese text, route redirects, and no fatal JavaScript errors. `route-map.spec.ts` tests authenticated routes conditionally when credentials are set, with safe notes restoration.

## Related

- [[AI/frontend/e2e-route-map]]: route map table of steps, actions and request timings.
- [[AI/frontend/frontend]]: map of the React app and its notes.
- [[AI/frontend/creating-a-component]]: where UI code lives, so a test targets the right screen.
