# Plan 06 - Quality, delivery and operations (operational)

Source: analysis sections 10.3, 11, 12, 15. Inspected 2026-10-14 on `main` (71171a6). Read-only commands only.

## Goal

Provide the verification and operational safety net that lets plans 01-05 land without regressions. No numeric targets are invented (RTO/RPO, latency, coverage stay "pending owner").

## 1. Current inventory (evidence)

| Area                                         | Exists                                                                                                                                                                                                                                                                       | Evidence                                    |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| API tests                                    | 13 files, ~95 `test(` calls, `node --test api/test/*.test.ts`                                                                                                                                                                                                                | `package.json` `test`; `api/test/*.test.ts` |
| Test run in this sandbox                     | 27/35 pass, 8 fail with `ERR_MODULE_NOT_FOUND: jose`; `node_modules` absent (not installed here). Not a code failure; baseline must be re-measured after `npm ci`.                                                                                                           | `node --test api/test/*.test.ts`            |
| Architecture tests                           | `AI/validation/*.test.mjs`, `branch-review` tests; 14/14 fail here for the same missing-dependency reason (`yaml`)                                                                                                                                                           | `npm run architecture:test`                 |
| typecheck / lint / format                    | Defined (`tsc -p api/tsconfig.json`, `eslint .`, `prettier --check .`); could not run (`tsc`/`eslint`/`prettier: not found`)                                                                                                                                                 | `package.json`                              |
| PG integration                               | `api/test/pg.test.ts`, 1 test, skipped unless `DATABASE_URL` is set                                                                                                                                                                                                          | file header                                 |
| Frontend tests                               | None. `web/src` has no `*.test.*`/`*.spec.*`; Angular build only                                                                                                                                                                                                             | `ls web/src`                                |
| E2E / load / failure / security-matrix tests | None dedicated. `auth.test.ts` (7) covers JWT paths only                                                                                                                                                                                                                     | `api/test/`                                 |
| OpenAPI                                      | `docs/openapi.json` (3.1.0, 2486 lines, ~25 paths, 0 `operationId`), served by `api/src/server.ts:52`; only test asserts `openapi === '3.1.0'` (`service.test.ts:231`). No request/response conformance check.                                                               | grep                                        |
| Zod / runtime schemas                        | Absent from `package.json`, `api/`, `shared/`. Types only: `shared/models.ts`, `shared/metadata.ts`.                                                                                                                                                                         | grep                                        |
| CI                                           | One workflow, `.github/workflows/architecture.yml`: per-commit branch-review (deterministic) + `architecture:test`; optional self-hosted semantic job gated by `vars.ARCHITECTURE_SEMANTIC_CI`. It does NOT run `npm run check` (typecheck, lint, format, API tests, build). | workflow file                               |
| Local hooks                                  | `lint-staged` config present; no `.husky/`; `.git/hooks` has only LFS hooks. Commit message `chore: remove mandatory local agent hooks` confirms. `commitlint.config.js` extends conventional but is not enforced anywhere (no CI step, no hook).                            | files                                       |
| Deploy                                       | `vercel.json` (legacy `builds`, region pdx1); `vercel-build` = `ng build && record-release.mjs`. No preview-specific checks.                                                                                                                                                 | `vercel.json`                               |
| Releases                                     | Append-only release log, `release:note/list/rollback/tag`; rollback never reverts DB migrations.                                                                                                                                                                             | `docs/deploy.md`, `db/README.md`            |
| DB                                           | Two parallel migration histories: `db/migrations/` (001-016, no 005) and `supabase/migrations/` (timestamped, plus `supabase_hardening`). No down-migrations. Migration 015 is non-repeatable.                                                                               | `ls`                                        |
| Secrets/deps scanning                        | None (no Dependabot, no gitleaks/audit step).                                                                                                                                                                                                                                | `.github/`                                  |
| Feature flags, ADR template                  | None. `AI/` has documentation/domain templates but no ADR template.                                                                                                                                                                                                          | `ls AI`                                     |

Confirmed vs analysis: Node tests, TS, ESLint, Prettier and validation scripts exist; frontend, contract, security, failure and E2E coverage is absent; `npm run check` is not enforced by CI.

## 2. Gaps

G1 CI does not gate typecheck/lint/format/test/build. G2 No contract test; OpenAPI is hand-written and unverified. G3 No runtime schema layer. G4 No frontend test stack. G5 No cross-user/role/token matrix. G6 No failure tests (Supabase down, slow DB, duplicate requests; the `/queue/reorder` early return is the known risk). G7 No restore drill, no migration rollback rule, dual migration histories. G8 No secret/dependency scan, no preview verification. G9 Evolution triggers (doc 12.3) are prose only.

## 3. Ordered tasks

### T0 Baseline (no code risk)

Run `npm ci && npm run check` in a clean checkout; record pass/fail counts in the PR description. Files: none. Exit: green baseline or a listed set of pre-existing failures.

### T1 Minimal CI gate (Phase A, first)

Add `.github/workflows/ci.yml` (see section 5). Keep `architecture.yml` unchanged. Add a commitlint step on PR range (`npx commitlint --from base --to head`). Exit: required status check on `main`.

### T2 Contract tests (Phase A)

Approach in section 4. Files: `api/test/contract.test.ts` (new), `docs/openapi.json` (add `operationId` and error schema once plan 01 fixes the envelope), fixtures `api/test/fixtures/` (new).

### T3 Security matrix skeleton (Phase A, with plan 02)

`api/test/security-matrix.test.ts` (new), table in section 6. Reuse the in-process server helper from `api/test/service.test.ts` and token minting from `api/test/auth.test.ts`.

### T4 Failure tests (Phase A/B)

`api/test/failure.test.ts` (new): repository stub that throws/delays (repositories are injected via `api/src/setup.ts`, so no real Supabase needed); duplicated `PUT/POST` with same body; reorder background failure surfaces per plan 01 decision. Real timeouts only with injected clock/abort, never sleeps over 1 s.

### T5 Frontend test stack (Phase B, after plan 03 scaffolds React)

Vitest + Testing Library + MSW (handlers generated from the same fixtures as T2) + `@axe-core` smoke checks; Playwright for 3-5 journeys: login, library filter, rate/status change, list queue reorder, logout/expired session. Files: `web/vitest.config.ts`, `web/e2e/*.spec.ts`, `playwright.config.ts` (all new, in the React tree of plan 03). Do not add Angular tests: Angular is being replaced.

### T6 Ops: backup/restore and migration rules (Phase A, documentation + one drill)

Checklist in section 7. Files: `docs/runbooks/backup-restore.md`, `docs/runbooks/migrations.md` (new), link from `docs/deploy.md`.

### T7 Scanning and flags (Phase B)

`.github/dependabot.yml`, `npm audit --omit=dev --audit-level=high` step, gitleaks action. Feature flags: a typed `flags` map read from env in `api/src/` and a Vite env mirror in web; no vendor service.

### T8 ADR template and triggers (Phase B)

`docs/adr/0000-template.md` (Context, Decision, Alternatives, Consequences, Status). `docs/ops/evolution-triggers.md`: each row of doc 12.3 gets metric source, check command, owner, threshold "pending owner". Metrics come from plan 05.

## 4. Contract-test approach (single source of truth)

Recommendation: **Zod is the source of truth; OpenAPI is generated from it and committed; TypeScript types are inferred (`z.infer`).** Rationale: runtime validation is needed anyway at trust boundaries (plan 01, doc 7), and plan 03 already selects Zod for the frontend; generating avoids hand-edited drift in 2486 lines of JSON.
Safe migration path (preserves `/api/v1`):

1. Characterization first (no Zod yet): `contract.test.ts` loads `docs/openapi.json`, boots the in-process server with the in-memory repository, calls every documented operation with fixtures, and validates responses against the spec schema using a small validator (Ajv 2020 for OpenAPI 3.1, dev-only). Also asserts every route registered in `api/src/server.ts` / `wishlist-routes.ts` appears in the spec and vice versa.
2. Introduce Zod schemas in `shared/schemas/` per resource (consumed by api and web); keep `shared/models.ts` types, re-derived via `z.infer`.
3. Add generation script `scripts/generate-openapi.mjs` (zod-to-json-schema or `@asteasolutions/zod-to-openapi`; decision D2) and a CI check `generate && git diff --exit-code docs/openapi.json`.
4. Breaking-change guard: compare generated spec to `main` (e.g. `oasdiff breaking`) and fail on removals/narrowing unless a version bump is declared.
   Fallback if the owner rejects the generator: OpenAPI remains the source, Zod schemas are validated against it by the same contract test.

## 5. Minimal CI pipeline (`ci.yml`, on push to main and pull_request)

Node 24, `npm ci` cached, `permissions: contents: read`. Jobs (parallel where possible):

1. `verify`: `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm test` (includes contract and security matrix, in-memory repos only), `npm run build`.
2. `scan`: gitleaks, `npm audit --omit=dev --audit-level=high`, lockfile present.
3. `commits`: commitlint over PR range.
4. `e2e` (path-filtered to `web/**`, `api/**`, after plan 03): Playwright against the Vercel preview URL or a local `npm run dev` with in-memory repos; 3-5 critical journeys only.
5. `pg` (optional, nightly or label-gated): `pg.test.ts` against a throwaway Supabase/Postgres service container with `DATABASE_URL`; applies migrations once, from one history only.
   Preview deploy: Vercel preview per PR (platform-provided); smoke = `GET /api/v1/version` and `/api/v1/config`. No custom infrastructure.

## 6. Security test matrix skeleton

Rows are routes from the spec; columns are principals. Expected results are fixed by plans 01/02 (status plus stable error code).

| Case                                                                                                                                                                                                                                                                                                                                                                                                 | Anonymous | Invalid token | Expired token | User A (own) | User B -> A's resource                              | Role without permission | Role with permission |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | ------------- | ------------- | ------------ | --------------------------------------------------- | ----------------------- | -------------------- |
| GET games/lists/queue/settings                                                                                                                                                                                                                                                                                                                                                                       | 401       | 401           | 401           | 200          | 404 (not 403, no existence leak; owner decision D4) | 403                     | 200                  |
| Mutations (PUT/POST/DELETE lists, queue, settings, wishlist)                                                                                                                                                                                                                                                                                                                                         | 401       | 401           | 401           | 2xx          | 404 and DB row unchanged                            | 403                     | 2xx                  |
| Nonexistent id                                                                                                                                                                                                                                                                                                                                                                                       | 401       | 401           | 401           | 404          | n/a                                                 | n/a                     | n/a                  |
| Admin routes (releases, catalog admin)                                                                                                                                                                                                                                                                                                                                                               | 401       | 401           | 401           | 403          | 403                                                 | 403                     | 200                  |
| Also: algorithm confusion (alg=none, wrong HS256 secret), wrong issuer/audience, missing `sub`, no-auth dev mode refused when `NODE_ENV=production`, no token or `Authorization` header in logs (with plan 05), CORS/origin check. Table-driven: one array of `{method, path, principal, expected}` generated from the OpenAPI paths so new routes fail the test until classified (deny by default). |

## 7. Backup/restore and migration rollback checklist

Backup/restore (drill once, then per owner-set cadence):

- [ ] Identify the hosted plan's backup type (daily/PITR) in the Supabase dashboard; record it (unknown from the repo).
- [ ] Restore latest backup to a NEW project; never over production.
- [ ] Verify: row counts for `games`, library, lists, queue tables, app owners; `app_release*` append-only triggers present; RLS enabled; sample user login works.
- [ ] Run `pg.test.ts` against the restored DB; record elapsed time (measured RTO) and age of the newest row (measured RPO). Targets stay "pending owner".
- [ ] Confirm JSON local storage is not used in production (serverless filesystem is ephemeral).
      Migration rules (`docs/runbooks/migrations.md`):
- [ ] One history per database (`db/` or `supabase/`, never both); decide D5 to remove the duplicate.
- [ ] Expand/contract: additive migration first, deploy code, remove old columns in a later release.
- [ ] Each migration PR includes a rollback note: reversible SQL, or "restore from backup" if destructive (migration 015 style).
- [ ] Take/verify a backup immediately before any destructive migration; enum additions committed before use.
- [ ] Application rollback (`release:rollback`) must be compatible with the current schema; state compatibility window in the release note.
- [ ] Apply to a preview/branch database first; run `pg.test.ts` and the contract suite after.

## 8. Acceptance criteria

- A1 `ci.yml` is a required check; a PR with a type error, lint error, failing test or leaked secret cannot merge.
- A2 Contract test fails when a route or response field diverges from the spec, and when the generated spec drifts.
- A3 Security matrix covers every spec operation; unclassified operation fails.
- A4 Failure suite passes with stubbed repositories (DB down, slow, duplicate requests).
- A5 Frontend: Vitest + MSW suite and 3-5 Playwright journeys run in CI against React.
- A6 One restore drill is executed and its results recorded in the runbook.
- A7 Evolution trigger table has metric, check and owner for each row.
- A8 Baseline test counts recorded before plan 01-03 changes begin.

## 9. Risks

- Baseline unknown (deps not installed here); pre-existing failures may exist. T0 mitigates.
- OpenAPI generation may reformat the 2486-line spec and hide real changes; commit generator output in a separate PR.
- Playwright needs credentials/test users; use dedicated test accounts or a stubbed auth in dev, never production data.
- Flaky timing tests; use injected clocks.
- Contract validator and generator add dev dependencies (Ajv, zod adapter); accepted, dev-only.
- Dual migration histories can hide drift in restore drills.

## 10. Dependencies on other plans

- 01 API errors: error envelope and codes must be fixed before T2 error schemas and T3 expected codes; the reorder semantic (accepted vs persisted) decides T4.
- 02 Auth/authz: permission table and 404-vs-403 policy feed the T3 matrix; token fixtures reuse `auth.test.ts`.
- 03 React migration: T5 starts only after the React scaffold exists; Zod in `shared/` is shared with it. No Angular test investment.
- 04 UI kit: adds axe/accessibility checks and component tests under T5 conventions.
- 05 Observability: supplies the metrics for T8 and the no-secret-in-logs assertion; `requestId` propagation is asserted in contract tests.
- Conflict to watch: plan 03 and plan 01 both may introduce Zod; this plan requires a single `shared/schemas/` location.

## 11. Open decisions for the owner

- D1 Accept Zod as source of truth (recommended) versus OpenAPI-first.
- D2 Generator choice (`zod-to-openapi` versus `zod-to-json-schema` plus a template).
- D3 Required CI checks and whether architecture semantic review stays optional.
- D4 404 versus 403 for another user's resource.
- D5 Retire `db/migrations` or `supabase/migrations` as the canonical history.
- D6 Backup cadence, RTO and RPO values (pending; none proposed).
- D7 Playwright test accounts and where E2E runs (preview URL versus local).
- D8 Enforce commitlint in CI (currently not enforced) and restore any local hooks (previously removed deliberately).
- D9 Flag mechanism: env-based only, or a table.
