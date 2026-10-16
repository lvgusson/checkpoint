---
name: api-contract
description: Self-review checklist for the API contract role. Use it before you report a task done.
type: reference
area: jobs
---

# API contract checklist

Apply this checklist to the changed scope. Mark unrelated items as not applicable.
Fix issues in scope. Record other gaps in `bd`.

## Before

- [ ] Did you read the current contract in `packages/core`?
- [ ] Do you know every consumer of this contract: web, API, tests?
- [ ] Is the change additive, or does it break existing clients?

## Design

- [ ] Does the route name a resource with a plural noun and the correct HTTP method?
- [ ] Does `GET` change nothing, and does `PUT` and `DELETE` stay idempotent?
- [ ] Does the request and response schema live in `packages/core` only once?
- [ ] Do both apps infer their types from that one schema?
- [ ] Does each field have a clear name, a type and a nullability rule?
- [ ] Do dates use ISO 8601 in UTC, and money use integer minor units?
- [ ] Do enums list all values, and do clients handle an unknown value?
- [ ] Does each error use one shape with a stable code and a message?
- [ ] Does each endpoint list its status codes: 200, 201, 400, 401, 403, 404, 409, 422?
- [ ] Do list endpoints use one pagination style, with a limit, a cursor or offset, and a total rule?
- [ ] Do filter and sort parameters have documented names and defaults?

## Compatibility

- [ ] Did you avoid removing or renaming a field in use?
- [ ] Do you deprecate a field before you remove it, with a date?
- [ ] Do you version the route when the change must break clients?

## Before you report done

- [ ] Does a contract test check the real response against the schema?
- [ ] Do both apps build and pass tests after the change?
- [ ] Do the examples in the docs match the real responses?
- [ ] Did you update the contract note in `AI/core`?
- [ ] Did `pnpm check` pass?

## Related

- [[AI/jobs/index]]: Role checklists for task review.
- [[AI/index]]: Entry point: pick the area you change and follow one link.
