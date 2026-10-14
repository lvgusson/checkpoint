# Observability

Call sites use one facade:

```ts
import { log } from '../logger.ts';
log.info('reorder.accepted', { gameId });
const scoped = log.child({ component: 'steam' });
```

`requestId` and `userId` are added from the request context (AsyncLocalStorage). Events are redacted
(keys matching token, authorization, password, secret, api key, cookie, credential) before any sink
sees them. Writing never throws or blocks: each sink is wrapped by `SafeSink` (bounded queue of 1000
events, oldest dropped and counted, exponential backoff from 100 ms to 30 s, 3 attempts per event).

`errors` (ErrorReporter), `metrics` (MetricsRecorder) and `tracer` (Tracer) default to the same sink
(metrics and spans at `debug`). Replace them with `setObservability({ errors, metrics, tracer })`.

## Environment variables

| Variable             | Default        | Meaning                                                               |
| -------------------- | -------------- | --------------------------------------------------------------------- |
| `LOG_SINK`           | `console`      | `console`, `file`, `memory`, `noop`, or a comma list (fan-out)        |
| `LOG_LEVEL`          | `info`         | `debug`, `info`, `warn` or `error`                                    |
| `LOG_FILE`           | `logs/api.log` | Path used by the `file` sink                                          |
| `LOG_FILE_MAX_BYTES` | `10485760`     | Rotation size; the old file moves to `<path>.1` (about 2x disk bound) |

An unknown `LOG_SINK` value falls back to `console` and prints a warning to stderr.

## Add a new sink in 5 steps

1. Write a class implementing `LogSink` (`packages/core/src/observability.ts`): `write(event)`, optional `flush`/`close`. It may throw or reject.
2. Put it in `apps/api/src/observability/` (for example `datadog-sink.ts`) and keep vendor imports there.
3. Add its name to the `SinkKind` union in `packages/core/src/observability.ts`.
4. Register it in `observability/sinks.ts`: `registerSink('datadog', ({ env }) => new DatadogSink(env.DATADOG_API_KEY))`.
5. Set `LOG_SINK=datadog` (or `console,datadog`). No call site changes.

Tests can call `setSink(new MemorySink())` from `logger.ts` and read `sink.events`.

## Browser collector

`POST /api/v1/telemetry` accepts `log`, `error` and `metric` events (optional free-form `eventName`
matching `^[A-Za-z][\w.:-]{0,79}$`) and writes them through the same sink, with `source: "client"`.

## Notes

- `fanout` is not accepted as a `LOG_SINK` list entry; list the destinations directly (`console,file`).
- Roles come from the JWT `app_metadata.role`. A role change takes effect only after the user's current access token expires (up to 1 hour by default), or when the HS256 fallback cache expires (30 s).
- Client telemetry events are logged as `client.<eventName>` and never go through the ErrorReporter.
