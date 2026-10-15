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

## Related

- [[AI/backend/backend]]: Request flow of apps/api and the map of backend notes.
- [[AI/patterns/design-patterns]]: Design patterns in use, where they live, and how to expand a class.
