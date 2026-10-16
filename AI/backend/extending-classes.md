---
name: extending-classes
description: Steps to add a repository, service method, route, permission or log sink.
type: how-to
area: backend
---

# How to extend the backend

Extend by adding an implementation behind an existing interface. Change a call site only when the interface itself must change.

## Add a persistence implementation

1. Implement the interface in `apps/api/src/data/ports.ts` (`GameRepository`, or the list, settings and wishlist equivalents).
2. Pass the resolved owner to private-record operations. Filter private queries by that owner. Shared catalog queries remain global.
3. Select it in `createData` (`apps/api/src/main/data.ts`) from an environment condition. `setup.ts` only composes services.
4. Check: run the API with the new mode and call `GET /api/v1/games`.

## Add a route

1. Add the method to the service in `apps/api/src/services/`. Keep HTTP out of services.
2. Wire the route in `apps/api/src/routes/` and register it in `apps/api/src/main/server.ts`.
3. Apply the permission rule in [[AI/backend/authorization]]: authentication, permission and ownership rules of the API.
4. Throw `AppError` for expected failures.
5. Document it in `apps/api/openapi.json`.
6. Check: call it with a valid and an invalid body; the error must be problem+json.

## Add a permission

Follow [[AI/backend/authorization]]: authentication, permission and ownership rules of the API.

## Add a log sink

Follow [[AI/backend/observability]]: why logging uses a pluggable sink, and how redaction and safety work.

## Rules for new classes

- Depend on an interface, receive collaborators through the constructor or factory, and keep construction in `apps/api/src/main/setup.ts`.
- Vendor imports live in one adapter file.
- Reach shared types through `packages/core/src`, never from `apps/web`.

## Related

- [[AI/backend/backend]]: Request flow of apps/api and the map of backend notes.
- [[AI/patterns/design-patterns]]: Design patterns in use, where they live, and how to expand a class.
