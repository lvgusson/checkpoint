---
type: how-to
area: backend
---

# How to extend the backend

Extend by adding an implementation behind an existing interface. Change a call site only when the interface itself must change.

## Add a persistence implementation

1. Implement the interface in `apps/api/src/repository.ts` (`GameRepository`, or the list, settings and wishlist equivalents).
2. Scope every query by the owner id. A missing owner returns nothing.
3. Select it in `createService` (`apps/api/src/setup.ts`) from an environment condition.
4. Check: run the API with the new mode and call `GET /api/v1/games`.

## Add a route

1. Add the method to the service (`service.ts`, `wishlist.ts`). Keep HTTP out of services.
2. Wire the route in `server.ts` (or a `*-routes.ts` file), check the permission first, and throw `AppError` for expected failures.
3. Document it in `apps/api/openapi.json`.
4. Check: call it with a valid and an invalid body; the error must be problem+json.

## Add a permission

Follow [[AI/backend/authorization]].

## Add a log sink

Follow `apps/api/src/observability/README.md`, summarized in [[AI/backend/observability]].

## Rules for new classes

- Depend on an interface, receive collaborators through the constructor or factory, and keep construction in `setup.ts`.
- Vendor imports live in one adapter file.
- Reach shared types through `packages/core/src`, never from `apps/web`.

## Related

- [[AI/backend/backend]]
- [[AI/patterns/design-patterns]]
