---
name: observability
description: Why logging uses a pluggable sink, and how redaction and safety work.
type: explanation
area: backend
---

# Observability

Call sites use one facade, `log.info('event.name', fields)`. The destination is a strategy chosen by `LOG_SINK` (`console`, `file`, `memory`, `noop`, `db`, or a comma list). Changing where logs go means changing that value or registering a new sink class; no call site changes. When `DATABASE_URL` is set, `DatabaseSink` automatically attaches to persist errors into the Supabase table `public.logs`.

Why a strategy: the log vendor is undecided and may change. Every sink is wrapped so a failing destination never reaches a request. Redaction runs before any sink sees an event. Database error logging is non-blocking and safe.

The commands, variables, and sink steps live in `apps/api/src/observability/README.md`.
Keep that file as the single source and link to it here.

Contracts (`Logger`, `LogSink`, `ErrorReporter`, `MetricsRecorder`, `Tracer`) are in `packages/core/src/observability.ts`. Browser events arrive at `POST /api/v1/telemetry`.

## Request timing

Result: each request has a server trace in microseconds and a browser record. Use them to find the bottleneck.

The server uses `process.hrtime.bigint()` (ns) and prints ms with 3 decimals. One trace per request lives in an `AsyncLocalStorage` (`traceStore` in `apps/api/src/observability/timing.ts`). The pool is shared, so the trace must be per request.

| Stage   | Meaning                                                                      | Where it is measured                       |
| ------- | ---------------------------------------------------------------------------- | ------------------------------------------ |
| `total` | Handler start to headers written                                             | `writeHead` hook in `main/server.ts`       |
| `recv`  | Browser to server, from `X-Client-Sent-At` (ms precision, has clock skew)    | `clientLatencyMs`                          |
| `auth`  | JWT check                                                                    | `span('auth')` in `main/server.ts`         |
| `route` | Dispatch: body read, route handler, service, database                        | `span('route')` in `main/server.ts`        |
| `ser`   | `JSON.stringify` of the response                                             | `span('ser')` in `send`                    |
| `db`    | Sum of SQL time. `desc` and `dbq` are the query count                        | `timed()` wraps the client in `data/db.ts` |
| `send`  | Headers written to response finished. Log line only: headers are already out | `onDone` in `main/server.ts`               |

`route` contains `db` and the time to read a request body. Subtract `db` to get app code time. `ser` is not set on error replies.

`span(name, fn)` times any sync or async call into a stage. It is exported but not yet used inside services or routes. Add it there when you need a finer stage.

## Detail gate

1. The header always has `total` and `db;desc=<queries>`.
2. Stages (`recv`, `auth`, `route`, `ser`) appear only when the caller is authenticated and either `TIMING_DETAIL=1` is set or the request has header `X-Timing-Detail: 1`. `detailEnabled` holds the rule.
3. The web client sends `X-Timing-Detail: 1` only in dev builds.
4. With `TIMING_DETAIL=1` the `http.request` log line has a `timing` object with all stages in ms, `send` and `dbq`.

## Browser side

1. The client sends `X-Client-Sent-At` and `X-Request-Id`.
2. `window.__timings` holds the last 100 records: `totalMs`, `serverMs`, `networkMs` (total minus server), `dbMs`, `queries`, `clickToSendMs` and `stages`.
3. `clickToSendMs` is the age of `window.event` when the request starts. It is null when no DOM event started the request.
4. `window.__timingSummary()` returns `{ "GET games": { n, totalMs: {p50,p95,max}, serverMs, networkMs, dbMs } }`. Ids in paths fold to `:id`. Read this in one call.

Limits: `.execute()`, `.values()` and cursors are not timed (none is used). Error logs that `DatabaseSink` writes during a request count in `db`. Queries in parallel add up, so `db` can exceed `route`. `recv` and `networkMs` include clock skew between browser and server.
Overhead: about 3 to 4 microseconds per request (3 spans, 3 queries, detail header) in a micro-benchmark.
Tests: `pnpm test apps/api/test/timing.test.ts`. Code: [[AI/frontend/data-and-state]].

## Related

- [[AI/backend/backend]]: Request flow of apps/api and the map of backend notes.
- [[AI/patterns/design-patterns]]: Design patterns in use, where they live, and how to expand a class.
