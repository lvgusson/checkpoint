---
type: reference
area: cross-cutting
---

# Design patterns in use

Use a pattern for the behavior it gives, not for style. Extend by adding an implementation, not by editing callers.

| Pattern              | Where                                                                               | Use it to                                          |
| -------------------- | ----------------------------------------------------------------------------------- | -------------------------------------------------- |
| Repository + Adapter | `GameRepository` in `apps/api/src/repository.ts`; JSON and Postgres implementations | Swap storage without touching services             |
| Composition root     | `createService` in `apps/api/src/setup.ts`                                          | Pick implementations in one place                  |
| Strategy + registry  | Log sinks: `registerSink` in `apps/api/src/observability/sinks.ts`                  | Change a destination by changing `LOG_SINK`        |
| Decorator            | `SafeSink` wraps every sink                                                         | Add safety (queue, backoff) without changing sinks |
| Facade               | `log` in `apps/api/src/logger.ts`                                                   | Give call sites one small API                      |
| Policy table         | `packages/core/src/authorization.ts`                                                | Decide permissions from data, evaluated in memory  |
| Error translation    | `AppError` to problem+json in `http-errors.ts`                                      | Keep internal errors off the wire                  |
| Query-key factory    | `useQueryKeys()` in `apps/web/src/query/keys.ts`                                    | Scope and invalidate cache precisely               |
| Variants (cva)       | `components/ui/*` with `class-variance-authority`                                   | Offer styles as named variants                     |
| Headless + intent    | `SortableList` emits `onMoveIntent`; the app decides the order                      | Keep generic UI free of domain rules               |
| Optimistic update    | `features/playing/gameWriter.ts`                                                    | Show change at once, roll back on failure          |

## Expanding a class or module

1. Prefer a new class that implements the interface over a new branch inside an existing class.
2. Add a new option or variant only when two callers need it.
3. Keep the interface small; split it when an implementation must stub methods it does not use.

## Related

- [[AI/backend/extending-classes]]
- [[AI/frontend/creating-a-component]]
- [[AI/index]]
