# Plan 05 — Vendor-neutral observability (operational)

Source: analysis §5, §10.2, §16.3 items 4-5. Evidence below was gathered from the code on `main` (commit 71171a6). No code is changed by this document.

## 1. Goal and non-goals

Introduce four telemetry contracts, a structured backend logger with `requestId`, an authenticated browser collector, and one first adapter, without coupling application code to Firebase, Datadog, Sentry or GCP.
Non-goals: direct browser writes to Firestore, dashboards, alerting, a durable queue, Redis, OpenTelemetry SDK adoption (only an export-compatible field naming).

## 2. Current state (confirmed by grep)

`console.*` calls, excluding `node_modules`/`dist`:

| Area                            | log | warn | error | Total | Evidence                                                                                                                                                         |
| ------------------------------- | --- | ---- | ----- | ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `api/src` (runtime)             | 1   | 3    | 3     | 7     | `server.ts:216` warn, `server.ts:218` log, `service.ts:312` warn, `service.ts:316` error, `wishlist.ts:148` warn, `version.ts:88` error, `background.ts:9` error |
| `api/src/wishlist-cli.ts` (CLI) | 6   | 0    | 1     | 7     | lines 61, 74, 75, 77, 80, 94, 108: user-facing CLI output, not telemetry; exclude                                                                                |
| `api/test/manual.test.ts`       | 0   | 4    | 3     | 7     | lines 354-400 monkey-patch `console.warn`/`console.error` to assert on logs; must be migrated to an injected test logger                                         |
| `web/src`                       | 0   | 0    | 1     | 1     | `web/src/main.ts:146` `bootstrapApplication(...).catch(console.error)`                                                                                           |

Gaps that matter more than the counts:

- The central error handler `api/src/server.ts:198-203` (`catch (e)`) does not log at all. A 500 is invisible server-side and returns `e.message` to the client (Plan 01 removes the leak; this plan must supply the log it will rely on).
- `requestId` already exists: `api/src/context.ts:8,22` creates `randomUUID()` per request through `AsyncLocalStorage`. It is never read anywhere else (grep: only `context.ts`), never logged, never returned in a header or error body.
- Authentication failures (`api/src/auth.ts:57,78,101` bare/partial `catch`) and about 12 silent swallows (`.catch(() => {})` in `service.ts:132`, `repository.ts:92`, `manual-repository.ts:86`, `wishlist-repository.ts:66`, `app-user.ts:68`) produce no signal.
- Background work: `runInBackground` (`background.ts:9`) is the only place the post-response `reorder` failure surfaces, and `service.ts:312-316` logs retries and final loss with free-form text and the raw error object (may include SQL/params).
- Deployment: `vercel.json` has a single `@vercel/node` function (`api/index.mjs`) in region `pdx1`; Node `>=24.15` (`package.json` engines). No Firebase/Firestore dependency exists in `package.json`; the word appears only in docs and seed files. `@vercel/functions` (`waitUntil`) is already a dependency.
- Messages are in Portuguese. Under AGENTS.md, new identifiers, event names and code comments must be English; user-visible messages are untouched.

## 3. Contracts (TypeScript sketches, `shared/telemetry/contracts.ts`)

Designed for Node and browser; no vendor types; every method is synchronous and never throws.

```ts
export type Severity = 'debug' | 'info' | 'warn' | 'error';
export type Attrs = Readonly<Record<string, string | number | boolean | null>>; // flat, no nested objects
export interface TelemetryContext {
  requestId?: string;
  traceId?: string;
  spanId?: string;
  userRef?: string;
}

export interface Logger {
  log(severity: Severity, event: string, attrs?: Attrs): void; // event: dot.case English, e.g. "reorder.persist_failed"
  child(bindings: Attrs & TelemetryContext): Logger;
}
export interface ErrorReporter {
  captureException(error: unknown, ctx?: { event?: string; attrs?: Attrs; fatal?: boolean }): void;
  captureMessage(message: string, severity: Severity, attrs?: Attrs): void;
}
export interface MetricsRecorder {
  increment(name: string, value?: number, tags?: Attrs): void;
  recordDuration(name: string, ms: number, tags?: Attrs): void;
  gauge(name: string, value: number, tags?: Attrs): void;
}
export interface Span {
  setAttributes(a: Attrs): void;
  recordError(e: unknown): void;
  end(status?: 'ok' | 'error'): void;
}
export interface Tracer {
  startSpan(name: string, parent?: TelemetryContext, attrs?: Attrs): Span;
}

export interface Telemetry {
  logger: Logger;
  errors: ErrorReporter;
  metrics: MetricsRecorder;
  tracer: Tracer;
  flush(timeoutMs: number): Promise<void>;
}
```

Implementations: `NoopTelemetry` (default, used by unit tests), `ConsoleJsonTelemetry` (one JSON line per event to stdout; works on Vercel log drains and locally), `MemoryTelemetry` (test double replacing the `console` monkey-patching), and `FirestoreSink` (section 6). Tracer is Noop plus requestId-derived span ids at first; real tracing is deferred until a vendor is chosen.
Wire event shape (OTel-compatible naming, not OTel SDK): `{ ts, severity, event, service, env, appVersion, requestId, traceId?, spanId?, userRef?, durationMs?, errorCode?, attrs }`. `appVersion` comes from `api/src/version.ts`. `userRef` is `HMAC-SHA256(userId, TELEMETRY_SALT)` truncated to 16 hex chars; raw `userId`, e-mail and tokens are never logged.

## 4. requestId origin and propagation

- Server-side origin: `runWithContext` in `api/src/context.ts:22` is the single source; keep `randomUUID()`. Accept an inbound `X-Request-Id` only if it matches `^[A-Za-z0-9-]{8,64}$`, otherwise generate (prevents log injection). On Vercel also record `x-vercel-id` as `attrs.platformId`.
- Emit it: set `X-Request-Id` response header in `server.ts` before any `send` (so 4xx/5xx and 204 carry it); Plan 01 includes it in the Problem Details body as `requestId`.
- Browser: the HTTP client (Plan 03/Ky) generates a UUID per call, sends `X-Request-Id`, and on error reads the response header, so UI error toasts and collector events share the id.
- Background work: `runInBackground` must capture the context at call time and re-enter it (`AsyncLocalStorage` survives `waitUntil` promises, but add a test) so `reorder` failures keep the originating `requestId`.
- Logger obtains context via `getContext()`; no signature changes in services (consistent with the existing design in `context.ts`).

## 5. Browser collector endpoint spec

`POST /api/v1/telemetry/events` (new route in `server.ts`, handler in `api/src/telemetry-routes.ts`; documented in `docs/openapi.json`, which Plan 06 contract tests cover).

- Auth: valid Supabase JWT required (reuses `auth.authenticate`, Plan 02). Unauthenticated pre-login errors are out of scope for v1 (open decision D4). Never accepted when `auth` is null in a public environment (Plan 01 guard).
- Request: `Content-Type: application/json`, body at most 16 KB (a dedicated limit; the generic `readJson` limit at `server.ts:36` is 100000 chars, too large and counted in chars not bytes), at most 20 events per batch.
- Schema (strict, unknown keys rejected, validation by Zod once Plan 01/03 chooses it; hand-written guard until then): `{ events: [{ ts: ISO string within +-24h, severity, event: /^[a-z][a-z0-9_.]{2,63}$/, route?: string<=120, errorName?: string<=80, message?: string<=500, stack?: string<=4000, attrs?: flat map <=10 keys, key<=40, string value<=200 }] }`.
- Allowed event names are an allow-list (`ui.error`, `ui.unhandled_rejection`, `http.client_error`, `ui.perf.web_vital`); others are dropped and counted.
- Redaction (server-side, applied to message, stack, route, attrs, in this order): drop keys matching `/token|secret|password|authorization|cookie|apikey|api_key|jwt|session/i`; replace values matching JWT (`eyJ[\w-]+\.[\w-]+\.[\w-]+`), `Bearer \S+`, e-mail, and query-string values in URLs (keep path only); truncate. Server overwrites `userRef`, `requestId` (from the header), `appVersion`, `service=web`; client-supplied values for those are ignored.
- Rate limit: per `userRef`, 60 events/min and 10 requests/min, in-memory token bucket per instance. Honest limit: serverless instances do not share memory, so this bounds only per-instance abuse; a hard global cap needs a store (D6). Response `429` with `Retry-After`.
- Responses: `202 {accepted, dropped}` always fast (does not await the sink; hand off through `runInBackground`/`waitUntil`). `400` invalid schema, `401`, `413`, `429`. Telemetry failure never turns into 5xx for the client.
- CORS/CSRF: same-origin only (Plan 01); no cookies are used, JWT in header.
- Client: bounded in-memory queue (max 50 events, drop oldest), batch flush every 10 s and on `visibilitychange=hidden` through `navigator.sendBeacon` is NOT usable because it cannot set `Authorization`; use `fetch(..., { keepalive: true })` (64 KB limit). Exponential backoff 1 s to 60 s with jitter, stop after 5 failures per session, de-duplicate identical stacks per minute. The collector client must never call itself on failure (no recursion).

## 6. Adapter options and honest Firestore assessment

| Option                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Cost / latency                                                                                                                                                                                                                                                                                                                                               | Credentials                                                                                                                                                                                                                   | Verdict                                                                                                               |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Console JSON to stdout (Vercel Logs + optional log drain)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | No new infra; Vercel retention is short on Hobby/Pro (hours to days; verify current plan), so not durable                                                                                                                                                                                                                                                    | none                                                                                                                                                                                                                          | Mandatory baseline, ship first                                                                                        |
| Firestore via `firebase-admin`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Writes are billed per document (about USD 0.18 per 100k writes on Blaze, free tier 20k/day; verify current pricing); no aggregation, no full-text, queries need indexes, no alerting. Cold start adds roughly 300-800 ms (SDK init + gRPC channel); writes from `pdx1` to a Firestore region far away add 50-200 ms each, hidden only if done in `waitUntil` | Service-account JSON in an env var (secret rotation burden, large key in Vercel env, 4 KB per-var limit does not apply to Vercel but base64 needed); a new Google Cloud project and billing; a second vendor next to Supabase | Feasible but weakest fit: it stores events, it does not observe them. Only justified by the owner's stated preference |
| Postgres table in the existing Supabase (`telemetry_event`, partitioned/purged by date)                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Already paid and connected via the pooler (`postgres` dependency); one extra insert in `waitUntil`; storage counts toward the Supabase quota and competes with product traffic                                                                                                                                                                               | none new                                                                                                                                                                                                                      | Best operational simplicity; recommend as the alternative to compare                                                  |
| Sentry/Axiom/Better Stack/Grafana Loki free tier                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Purpose built (grouping, alerts, retention); HTTP ingest, no SDK required                                                                                                                                                                                                                                                                                    | one token                                                                                                                                                                                                                     | Likely better value if dashboards/alerts are wanted later                                                             |
| Recommendation: ship Console JSON + `MemoryTelemetry` now (contracts proven, zero credentials). Build `FirestoreSink` only after the owner confirms D1 and a measured spike (write p95 from a deployed function, daily event estimate). Design the sink behind `TelemetrySink { write(batch: WireEvent[]): Promise<void> }` so swapping to Postgres/HTTP is a composition change in `api/src/telemetry/compose.ts`, selected by `TELEMETRY_SINK=console                                                                                                       | firestore                                                                                                                                                                                                                                                                                                                                                    | postgres                                                                                                                                                                                                                      | none`.                                                                                                                |
| Sink rules: batch writes (`BulkWriter`/`batch` up to 500 ops), a hard timeout of 2 s, in-memory buffer of 200 events, drop-oldest on overflow, count drops as metric `telemetry.dropped`; flush through `waitUntil` at the end of each request; a failing sink falls back to stdout. Document IDs are `ts-requestId-seq` (no auto-ID hotspot on a monotonic key; avoid pure timestamp IDs). Set a Firestore TTL policy on `expireAt` (default 30 days debug/info, 90 days error). Firestore security rules deny all client access; only the Admin SDK writes. |
| Audit log: separate contract `AuditLog.record(action, actor, target, outcome)` and separate collection/table, never sampled, never routed to the ordinary sink; only for admin and permission events (depends on Plan 02 roles). Retention is a decision (D5).                                                                                                                                                                                                                                                                                                |

## 7. Ordered tasks

1. `shared/telemetry/contracts.ts`, `noop.ts`, `memory.ts`, `redact.ts` (pure function plus its denylist). Acceptance: typecheck passes under `tsc -p api/tsconfig.json`; tests below pass; no import from `firebase-*`.
2. `api/src/telemetry/console-json.ts` and `compose.ts`; inject through `makeServer(...)` as a new optional parameter (default `ConsoleJsonTelemetry`), following the existing optional-parameter pattern; `api/index.mjs` and `server.ts` main wire it. Acceptance: one JSON line per event with `requestId`.
3. `context.ts`: validated inbound `X-Request-Id`; `server.ts`: response header on all paths; log one `http.request` event per request (method, route template not raw URL, status, `durationMs`) in a `finally`. Acceptance: header present on 200, 404, 500, 204.
4. `server.ts:198` catch: log 5xx with `captureException` and 4xx `AppError` at `info`/`warn` without stack; never log `Authorization`. Acceptance: forced 500 yields exactly one error event with the same `requestId` as the response header. Coordinate with Plan 01 (same lines).
5. Replace the 7 runtime `console.*` calls (table above) with logger events; `background.ts` re-enters context; `service.ts:312-316` becomes `reorder.retry` / `reorder.persist_failed` with `gameId`, `attempt`, `errorCode` and no raw error object. Add events for `auth.reject` (reason code only) and replace the `server.ts:216-218` startup lines. Leave `wishlist-cli.ts` untouched. Migrate `api/test/manual.test.ts:354-400` to `MemoryTelemetry`. Acceptance: grep for `console\.` in `api/src` returns only `wishlist-cli.ts` and the console-json sink; ESLint `no-console` rule (allow list) enforces it.
6. Collector route + redaction + limits (section 5), OpenAPI entry. Acceptance: tests in section 8.
7. Web client reporter (`web/` Angular today; React port in Plan 03): global error hooks, queue, backoff; replaces `main.ts:146` `console.error`. Must be framework-agnostic code in `shared/` so Plan 03 reuses it.
8. Optional spike then `FirestoreSink` (or Postgres sink) behind the flag; migration of TTL/purge; env docs in `docs/deploy.md`.
9. Metrics v1 (counters/durations emitted as `metric.*` log lines; no backend): `http.request.duration`, `reorder.persist_failed`, `telemetry.dropped`, `telemetry.sink_error`.

## 8. Tests

- Unit: redaction table (JWT, bearer, e-mail, nested key, URL query, oversize) and `userRef` stability; logger never throws when the sink throws or rejects; buffer drops oldest and counts; backoff schedule with fake timers.
- API (`node --test`, existing style in `api/test`): `X-Request-Id` accepted/ignored/regenerated; header on every status; collector 401/400/413/429/202; forged `userRef`/`requestId` in the body is overwritten; 500 path logs once with no secret in output (assert on `MemoryTelemetry` and on captured stdout from `ConsoleJsonTelemetry`); `reorder` background failure keeps `requestId`.
- Failure isolation: sink that hangs is cut at 2 s and the response still succeeds.
- Contract: `docs/openapi.json` includes the collector route (Plan 06 gate).

## 9. Risks

- Firestore on serverless: cold-start and cost above; write amplification if each request emits several events; runaway cost from a client error loop (mitigated by the quotas, dedupe, allow-list; add a GCP budget alert).
- Log volume from `http.request` on every call; sample 2xx at configurable rate, never sample errors or audit.
- PII in free-text `message`/`stack`; redaction is best effort, so the collector accepts structured fields preferentially and truncates.
- Hot path overhead: `AsyncLocalStorage` and JSON serialization are cheap; the hazard is awaiting the sink, which is forbidden.
- `waitUntil` has a platform time cap (function `maxDuration`); late flushes can be lost. Acceptable for telemetry, not for audit (audit writes use the database transactionally).
- Rate limiter is per instance, not global.

## 10. Dependencies on other plans

- 01 (API errors): shares `server.ts:198` catch and the `requestId` in Problem Details. Order: land Task 3 and 4 together with, or immediately before, Plan 01's error mapper; otherwise two plans edit the same block. Plan 01 should also fix the 100000-char `readJson` limit separately from the collector limit.
- 02 (auth/authz): collector auth, `userRef`, audit-log events need roles; the unauthenticated-collector decision depends on D4. `auth.reject` events reuse its error codes.
- 03 (React): the browser reporter and `X-Request-Id` generation live in the shared HTTP client; build reporter framework-neutral so it survives the migration from Angular.
- 04 (UI kit): none beyond an error-boundary component that calls `ErrorReporter`; user-facing error toast should show `requestId`.
- 06 (quality/ops): OpenAPI contract test for the collector, `no-console` lint rule in CI, secret scanning for the Firebase key, backup/retention of the audit store, and conversion of the section 7 metrics into the evolution-trigger checks.

## 11. Open decisions for the owner

- D1: Firestore confirmed after the cost/latency spike, or switch to Supabase Postgres or an HTTP log service (analysis §16.3 item 5)?
- D2: Which events, volume per day, and queries are needed at start (§16.3 item 4)? Needed to size cost and indexes.
- D3: Retention per class (debug/info, error, audit) and who may read the store.
- D4: Accept unauthenticated browser errors (login/boot failures) through a stricter anonymous endpoint, or authenticated only?
- D5: Is a real audit log needed now, given there are no admin roles yet (depends on Plan 02)?
- D6: Is a global (shared-store) rate limit worth a new dependency, or is per-instance acceptable?
- D7: Pseudonymous `userRef` with a salt, or no user identifier at all (LGPD stance, §10.2)?
- D8: Is a Google Cloud project with billing acceptable for a service-account credential in Vercel env?
