# Plan 03 - React frontend migration (operational)

Sources: `CHECKPOINT_ANALISE_ARQUITETURAL.md` sections 3, 7.1, 7.3, 9, 14 (Stage B). Evidence below was read from the working tree on 2026-10-14. Line references use the current `main`.

## 1. Goal and non-goals

Port the Angular 22 SPA in `web/` to React + TypeScript + Vite with no functional regression against the unchanged `/api/v1`. Out of scope: backend changes, package extraction, redesign (Plan 04), telemetry (Plan 05).

## 2. Verified findings

Confirmed:

- F1. Angular 22.2.2, standalone components, signals, inline templates; 25 TS files, 7,267 lines in `web/src` (`package.json:36-41`, `wc -l`). There are no `.html` templates except `web/src/index.html`.
- F2. `DataCache` (`web/src/data-cache.ts`) provides: SWR with a 60 s freshness window (`:23`), 7-day localStorage max age (`:25`), in-flight dedupe (`fetch`, `:162-177`), prefix invalidation that also deletes in-flight requests so pre-mutation reads cannot repopulate the cache (`invalidate`, `:127-145`), per-user scope that clears memory on user change (`scope`, `:47-54`), `patch`, `set`, `drop`, quota-eviction of the oldest half (`persist`), and a `version` signal for open screens. `clearDataCache()` runs on logout (`auth.service.ts:68`, `:136`).
- F3. Refresh single-flight: `AuthService.refreshToken()` shares one promise (`auth.service.ts:92-100`); `authInterceptor` retries once after a 401 and signs out locally if refresh or retry fails (`auth.interceptor.ts:17-48`). It attaches tokens only to URLs starting `/api/` and skips `/api/v1/config` (`:20`).
- F4. Optimistic playing is a framework-free class `PlayingUpdates` (`playing-updates.ts:8-93`): per-game state `{confirmed, desired, revision}`, coalescing of rapid toggles, a drain loop, reconcile via `GET /games/:id` on failure, and `updatePlayingQueue` as a pure queue patch. It is already unit-tested from `api/test/playing-updates.test.ts:3` (imports `../../web/src/playing-updates.ts`). `Api.persistSave` additionally serializes writes per game id (`api.ts:107-118`).
- F5. Reorder returns early: `POST /queue/reorder` answers on validation (`api.ts:84-94`, `api/src/server.ts:148`); the queue screen keeps its own send chain (`queue.ts:1115-1125`) and restores the last saved order on error.
- F6. Auth uses `@supabase/supabase-js` with `persistSession`, `autoRefreshToken`, `detectSessionInUrl` (`auth.service.ts:59-61`); config comes from `GET /api/v1/config` through raw `fetch` (`:50`). `onAuthStateChange` handles `PASSWORD_RECOVERY` and `SIGNED_OUT` (`:64-71`). Username login maps to `<name>@gps.dev.br` (`:24`, `:105`). `safeRedirect` blocks open redirects (`auth.guard.ts:20-23`).

Refuted or corrected:

- R1. The analysis says the interceptor carries the refresh "property to Ky"; this is true, but there is no retry policy anywhere in the frontend today (`grep retry|timeout web/src` is empty). The "single retry owner" rule therefore starts from zero: Ky retry stays off, Query retry is the only owner for reads.
- R2. Analysis 2.1 implies a shared component layer; there is none. Every screen has its own inline template and CSS (largest: `queue.ts` 1,257 lines, `settings.ts` 992). Drag and drop is hand-written pointer/keyboard code (`queue.ts:558-805`, `onHandleKey`), not a library (no `@angular/cdk`). Plan 04 (dnd-kit) is therefore a rewrite, not a swap.
- R3. `npm run typecheck` is `tsc -p api/tsconfig.json` (`api/tsconfig.json:4`) and does not include `web/`; only `ng build` type-checks the frontend. There are zero frontend test files; `playing-updates.ts` is the only web file under test. The CI workflow in `.github/workflows/architecture.yml` runs only architecture checks, not `npm run check`.
- R4. Error contract is not Problem Details yet: the client reads `error.error.error.message` (`queue.ts:1122`), i.e. `{ error: { message } }`. The Ky error normalizer must support this shape until Plan 01 lands.
- R5. Not in the analysis: persisted state outside `DataCache` that the port must keep or migrate: `checkpoint:previous-desire` (`api.ts:144-165`), `checkpoint:appearance:<uid>` and `checkpoint:appearance:last` (read by the inline script in `index.html:13-27` before first paint), legacy `checkpoint:scoring-settings:*` (cleared at `data-cache.ts:34`).
- R6. The deploy is `@vercel/static-build` with `distDir: dist/web/browser` and `vercel-build` = `ng build && node scripts/record-release.mjs` (`vercel.json:5-8`, `package.json:23`). Dev proxies `/api` to `127.0.0.1:3000` via `web/proxy.conf.json` and `scripts/dev.mjs` spawns `ng serve`. All of these must change for Vite. SPA fallback already exists in `vercel.json:20`.
- R7. Routes are Portuguese and must stay (bookmarks, Supabase redirect URLs `/jogos`, `/redefinir-senha`): `/login`, `/redefinir-senha`, `/jogos`, `/jogos/:id`, `/ordem[/:listId]`, `/desejos`, `/configuracoes[/:listId]`, `/aparencia` (`main.ts:106-120`).

## 3. Screen and component inventory (port order)

Sizes are current Angular lines. Order goes from lowest risk to highest and from least shared state to most.

| #   | Unit                                                                    | File (lines)                                                                                                  | Notes                                                                  |
| --- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| 0   | Shell, nav, theme toggle, skip link, bare mode for login                | `main.ts` (146)                                                                                               | Rebuild as layout route; `bare` rule `/login`, `/redefinir-senha`.     |
| 1   | Auth: Ky client, session provider, guards, Login/Reset                  | `auth/*` (657)                                                                                                | Keep `supabase-js`; port `AuthService` to a store plus React context.  |
| 2   | Appearance and Logo, Bonfire                                            | `appearance.ts` 148, `appearance-page.ts` 365, `logo.ts` 100, `bonfire.ts` 84                                 | Pure localStorage; no API. Keep the `index.html` pre-paint script.     |
| 3   | Shared helpers                                                          | `metadata-presentation.ts`, `immediate.ts`, `api.ts` (`color`, desire memory), `scoring-settings.ts`          | Framework-free parts move unchanged to a `web-react/src/lib`.          |
| 4   | Lists store, ListPicker                                                 | `lists.ts` (561)                                                                                              | Needed by Queue and Settings; `routeListId` redirect logic.            |
| 5   | Library                                                                 | `library.ts` (290)                                                                                            | Query with params; search not persisted (`api.ts:58`).                 |
| 6   | Detail, PlayingButton, MetadataSelect, PrerequisiteSearch, FinishDialog | `detail.ts` 376, `playing.ts`, `metadata-select.ts` 291, `prerequisite-search.ts` 253, `finish-dialog.ts` 480 | First consumer of `savePatch` and optimistic playing.                  |
| 7   | Wishlist                                                                | `wishlist.ts` 409, `wishlist-api.ts` 69                                                                       | Invalidates game dependents on add/import.                             |
| 8   | Settings (rules)                                                        | `settings.ts` 992                                                                                             | Large form; per-list settings. Biggest form risk.                      |
| 9   | Queue (last)                                                            | `queue.ts` 1,257                                                                                              | Custom DnD, optimistic order, playing patch, send chain. Highest risk. |

## 4. Semantics mapping

Principle: the server cache is TanStack Query; the optimistic-playing state machine stays as the framework-free `PlayingUpdates` class (move file unchanged, keep `api/test/playing-updates.test.ts` passing).

| Angular today                                                | React target                                                                                                                                                                                                                                                                                                                                                        |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DataCache.swr` (60 s fresh, cached value first)             | `QueryClient` `staleTime: 60_000`; `placeholderData`/persisted cache gives the instant first paint.                                                                                                                                                                                                                                                                 |
| localStorage persistence, 7 days, per user                   | `@tanstack/react-query-persist-client` with a sync localStorage persister, `maxAge: 7d`, `buster` = build id; key prefix `checkpoint:rq:<uid>`. Do not persist `games` queries with `q` (`dehydrateOptions.shouldDehydrateQuery`).                                                                                                                                  |
| Scope per user, clear on logout                              | Query keys start with `[uid, ...]`; on `SIGNED_OUT` call `queryClient.clear()` and remove the persisted blob plus legacy `checkpoint:cache:*`, `checkpoint:scoring-settings:*`.                                                                                                                                                                                     |
| `invalidate(GAME_DEPENDENTS)` (marks stale, drops in-flight) | `queryClient.cancelQueries` then `invalidateQueries` for the same key groups (`games`, `game`, `queue`, `catalog`, `wishlist`). Keep a single `keys.ts` factory.                                                                                                                                                                                                    |
| `cache.set` after PATCH / `resetManual` / `refreshPrices`    | `setQueryData` in `onSuccess`, then `invalidateQueries` on the other dependents.                                                                                                                                                                                                                                                                                    |
| `version` signal                                             | Not needed; mounted `useQuery` observers refetch on invalidation.                                                                                                                                                                                                                                                                                                   |
| `force` (Recalculate button)                                 | `refetch()` / `invalidateQueries({ refetchType: 'active' })`.                                                                                                                                                                                                                                                                                                       |
| In-flight dedupe                                             | Native to Query.                                                                                                                                                                                                                                                                                                                                                    |
| Quota eviction in `persist`                                  | Persister catches `QuotaExceededError`, drops the persisted blob (accepts losing warm start); never throws.                                                                                                                                                                                                                                                         |
| `persistSave` per-game write serialization                   | `useMutation({ scope: { id: 'game:' + id } })` serializes mutations of the same game. `save()` still awaits `PlayingUpdates.wait(id)` first.                                                                                                                                                                                                                        |
| `PlayingUpdates` + `playingEvents`                           | Instantiate once per signed-in user; `notify` writes with `setQueryData` into `game`, `games`, and `queue` (using `updatePlayingQueue`); phase `failed` calls `invalidateQueries`. Tests unchanged.                                                                                                                                                                 |
| Queue optimistic reorder + `sending` chain + `rememberQueue` | Mutation with `scope: { id: 'queue:' + listId }`, `onMutate` snapshots and sets the order, `onError` restores snapshot and shows the message, `onSettled` invalidates only when the chain is empty (preserves `pendingMoves`/`settle`). Reorder responds "accepted", so the success state is "accepted"; reconciliation by refetch (aligns with Plan 01 semantics). |
| Interceptor token attach                                     | Ky `beforeRequest` hook: only for relative `/api/` URLs, skip `/api/v1/config`.                                                                                                                                                                                                                                                                                     |
| 401 refresh + one retry                                      | Ky `afterResponse` hook calling the existing single-flight `refreshToken()`; retry once with `ky(request)` and a marker header or `retryCount` guard; on a second 401 or refresh failure call `signOut('local')`. No refresh on 403, 422 or 5xx (Plan 02 rule). Ky `retry: 0` globally.                                                                             |
| Error `error.error.error.message`                            | Ky `beforeError` hook builds `ApiError {status, code?, message, requestId?}`; accepts both legacy `{error:{message}}` and Plan 01 Problem Details. UI reads only `ApiError`.                                                                                                                                                                                        |
| Retry owner                                                  | Query: `retry` 2 with backoff only for GET and only when `ApiError.status` is 0, 408, 429 or >= 500; `retry: false` for mutations (no blind write retry; ambiguous timeouts reconcile with refetch). Ky never retries.                                                                                                                                              |
| Zod                                                          | `shared/models.ts` has types only (no Zod). Add Zod schemas at the Ky response edge for `Catalog`, `GamePage`, `ScoredGame`, `Recommendations`, `WishlistItem`, `PublicConfig`; failure raises `ApiError` code `contract_violation` (log only in v1 to avoid breaking users; flip to strict after one release). Open decision D3 on the source of truth.            |

## 5. Ordered tasks

Directory decision (see D1): new app in `web-react/` beside `web/` for the parallel period; `web/` is deleted at cutover.

T0. Baseline (before any code). Record with Lighthouse mobile preset and a Playwright script against the production URL for: cold open to `/jogos`, `/ordem` first render (cold and warm cache), toggle playing to UI update, reorder to UI settled, API request count per journey (HAR), JS bundle bytes from `ng build`. Store results in the plan appendix. No numeric targets invented; acceptance is "not worse than baseline by more than the agreed tolerance" (D5).
T1. Scaffold: `web-react/package` scripts in the root `package.json` (single workspace, no new monorepo tool): add `react`, `react-dom`, `react-router` (or TanStack Router, D2), `@tanstack/react-query`, `@tanstack/react-query-persist-client`, `ky`, `zod`, `vite`, `@vitejs/plugin-react`, `vitest`, `@testing-library/react`, `msw`, `eslint-plugin-react-hooks`. Files: `web-react/index.html` (copy the pre-paint theme script), `web-react/vite.config.ts` (proxy `/api` to `127.0.0.1:3000`, `outDir: dist/web/browser` only at cutover; until then `dist/web-react`), `web-react/tsconfig.json` extending `tsconfig.api.json` with `jsx: react-jsx`, new `typecheck:web` script added to `npm run check`, ESLint block for `web-react/**`. Move `web/public/*` to `web-react/public/`.
T2. `src/lib`: copy framework-free modules unchanged (`playing-updates.ts`, `metadata-presentation.ts`, `immediate.ts`, `scoring-settings.ts` pure parts, `color`, desire memory). Repoint `api/test/playing-updates.test.ts` import only at cutover.
T3. `src/http/client.ts` (Ky with hooks above), `src/http/errors.ts`, `src/http/schemas.ts`, `src/query/client.ts`, `src/query/keys.ts`, `src/query/persist.ts`. Unit tests (section 7) first.
T4. `src/auth/`: `session.ts` (port of `AuthService`: init via raw `fetch('/api/v1/config')`, `onAuthStateChange`, `refreshToken` single-flight), `AuthProvider`, route guards (`authGuard`, `guestGuard`, `safeRedirect` verbatim), Login/Reset screen.
T5. Shell (`App`, nav, `bare`), Appearance store/page/logo.
T6. Lists store (`useLists`), `routeListId` redirect, ListPicker.
T7. Library, Detail family, Wishlist.
T8. Settings.
T9. Queue; DnD ported 1:1 as a custom hook first (`useQueueDrag`), no dnd-kit until Plan 04 decides (D4).
T10. Playwright journeys (section 7) against both builds.
T11. Cutover (section 6).

Each of T4-T9 merges only with its Vitest/MSW tests and a manual parity checklist (keyboard reorder, aria-live messages, focus after route change, 44 px targets).

## 6. Cutover and rollback

- Parallel run: `web-react/` is built to `dist/web-react` and served on a Vercel preview with the same API; Angular stays production. Add a second `builds` entry or a preview-only project; no production route change before T10 passes.
- Cutover (one commit): change `vercel-build` to `vite build && node scripts/record-release.mjs`, set `outDir` to `dist/web/browser` (keeps `vercel.json` `distDir` unchanged), update `scripts/dev.mjs` (spawn `vite` instead of `ng`), replace the Angular ESLint blocks, remove `angular.json`, `tsconfig.app.json`, `web/` and Angular deps, and repoint the playing-updates test. Verify `scripts/record-release.mjs` does not depend on the Angular output layout (not yet read; check in T11).
- Data compatibility: same localStorage keys for appearance and previous desire; Supabase session keys are untouched, so users stay signed in. Old `checkpoint:cache:*` entries are purged once at boot after cutover.
- Rollback: keep the last Angular commit tagged (`npm run release:tag`) and use `npm run release:rollback` (Vercel redeploy of the previous release) as the first-line rollback; the API is unchanged so no data migration is reversed. Frontend-only `git revert` of the cutover commit is the second line. Service worker is absent (manifest only), so no stale-shell risk.
- Keep Angular code in the tree for one release after cutover, then delete.

## 7. Tests and acceptance

Tests (Vitest + MSW unless noted):

1. Ky: attaches token only for `/api/`; never for `/api/v1/config` or another origin; no `Authorization` on foreign URL.
2. Refresh: 5 concurrent 401s cause exactly one `refreshSession`; each request retried once; second 401 signs out; 403/422/500 never refresh; Ky does not retry.
3. Query retry: GET 503 retries per policy; mutation never retries; 401 is not retried by Query.
4. Cache: per-user isolation (user A data never visible after switching to B); logout clears memory and persisted blob; invalidation during an in-flight read discards its result (parity test with `data-cache` behavior); quota error does not throw.
5. Optimistic playing: existing `api/test/playing-updates.test.ts` unchanged and green; plus a hook test for rapid double toggle, failure with reconcile, and queue patch.
6. Reorder: optimistic order, rollback on error with message, chained moves, settle refetch once.
7. Contract: Zod schemas parse recorded fixtures from every GET route (also catches API drift for Plan 06).
8. Playwright (critical journeys): login with username alias and with email, redirect param, expired-token recovery, library search, toggle playing from Library and Queue, drag reorder by pointer and by keyboard, wishlist add, settings save/reset, logout.
9. Accessibility: axe on each route; reduced motion respected.

Acceptance: all Angular routes in R7 exist and deep-link; all T10 journeys pass on mobile and desktop viewports; no regression beyond tolerance D5 against T0 baseline for the measured journeys; request count per journey not higher than baseline; `npm run check` includes frontend typecheck, lint and tests; no `localStorage` key loss for appearance; bundle size reported.

## 8. Risks

- Queue DnD and optimistic ordering are the highest regression risk (1,257 lines, no tests). Mitigation: port last, characterize with Playwright against Angular first.
- Query default refetch-on-focus/mount can multiply requests vs. the 60 s SWR rule: set `refetchOnWindowFocus: false`, `refetchOnMount` obeying `staleTime`.
- Persisted cache shape drift across deploys: `buster` per build, 7-day max age.
- Two retry layers or double refresh: guarded by tests 2 and 3.
- React 19 strict-mode double effects can duplicate `init()` and `onAuthStateChange` subscriptions: initialise outside components and unsubscribe on cleanup.
- Supabase `getSession` inside `onAuthStateChange` callback can deadlock (comment `auth.service.ts:63`): keep the rule.
- Frontend currently has no CI gate (R3): the new app must not be the first code merged without one.

## 9. Dependencies on other plans

- Plan 01 (API errors): Ky `beforeError` supports both shapes; reorder "accepted vs persisted" wording drives the reorder mutation state. Not blocking; Problem Details can land before or after cutover. Conflict to watch: Plan 01 may change status codes or add CORS/security headers (CSP affects the inline pre-paint script and `data:` logos; coordinate).
- Plan 02 (auth): this plan keeps SDK-managed sessions (ADR may later choose BFF). Ky 401/403 rules are taken from Plan 02. If the ADR chooses HttpOnly cookies, the Ky auth hook and `AuthProvider` change, which is why they are isolated in `src/auth` and `src/http`.
- Plan 04 (UI kit): runs after T9; no Tailwind/shadcn/dnd-kit/React Hook Form in this migration (port existing CSS and behavior). Conflict: Plan 04 dnd-kit replaces the custom DnD this plan ports; sequence them, do not combine.
- Plan 05 (observability): the `ApiError.requestId` and an `onError` seam in the Query client are the only hooks; no telemetry code here.
- Plan 06 (quality/ops): supplies MSW/Vitest/Playwright setup and CI; this plan needs a minimal version of it at T1. Zod-vs-OpenAPI source of truth (D3) is decided there.

## 10. Open decisions for the owner

- D1. Directory: `web-react/` parallel then delete `web/` (recommended) versus in-place rewrite.
- D2. Router: React Router (lower risk, Portuguese paths and redirects are simple) versus TanStack Router (typed params, more migration cost). Recommendation: React Router now.
- D3. Zod schemas written by hand in `web-react` (recommended for now) versus generated from `docs/openapi.json`; strict versus log-only validation.
- D4. Keep custom DnD in this plan (recommended) versus adopt dnd-kit during the port.
- D5. Regression tolerance for the T0 baseline (suggest "no worse than +10% on medians" as a proposal, not a decided target).
- D6. Is a short Angular+React parallel period on production (feature flag or path prefix `/beta`) wanted, or is preview-only enough?
- D7. Persist the query cache to localStorage (preserves current warm start; recommended) or memory only.
