---
type: explanation
area: backend
---

# Observability

Call sites use one facade, `log.info('event.name', fields)`. The destination is a strategy chosen by `LOG_SINK` (`console`, `file`, `memory`, `noop`, or a comma list). Changing where logs go means changing that value or registering a new sink class; no call site changes.

Why a strategy: the log vendor is undecided and may change. Every sink is wrapped so a failing destination never reaches a request. Redaction runs before any sink sees an event.

The commands, variables and the five steps to add a sink live in `apps/api/src/observability/README.md`; keep that file as the single source and link to it here.

Contracts (`Logger`, `LogSink`, `ErrorReporter`, `MetricsRecorder`, `Tracer`) are in `packages/core/src/observability.ts`. Browser events arrive at `POST /api/v1/telemetry`.

## Related

- [[AI/backend/backend]]
- [[AI/patterns/design-patterns]]
