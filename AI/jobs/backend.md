---
name: backend
description: Self-review checklist for the backend role. Use it before you report a task done.
type: reference
area: jobs
---

# Backend checklist

Apply this checklist to the changed scope. Mark unrelated items as not applicable.
Fix issues in scope. Record other gaps in `bd`.

## Before

- [ ] Did you read the matching note in `AI/backend`?
- [ ] Does the contract in `packages/core` already describe this behavior?
- [ ] Do you know which layer owns the change: route, use case or data access?

## During

- [ ] Does the route validate body, query and params with a schema?
- [ ] Does the route keep business rules out of the HTTP layer?
- [ ] Does each endpoint check authentication and authorization?
- [ ] Does each query filter by the owner or tenant of the caller?
- [ ] Does the code use parameterized queries only?
- [ ] Does each error map to one status code and one stable error code?
- [ ] Does the API hide stack traces and internal messages from the client?
- [ ] Does a write that touches many rows run in one transaction?
- [ ] Is a repeated request safe (idempotent) when a client can retry it?
- [ ] Does each outgoing call have a timeout and a retry rule?
- [ ] Does a list endpoint paginate and cap the page size?
- [ ] Does the code avoid N+1 queries and repeated reads of the same row?
- [ ] Does the code read configuration from validated environment variables?
- [ ] Does the code log the event with a request id and without personal data?

## Before you report done

- [ ] Does a Vitest test cover the success path and each error path?
- [ ] Does a test prove that a user cannot read data of another user?
- [ ] Do database tests pass after `pnpm db:up`?
- [ ] Did you remove dead code and unused exports?
- [ ] Do both apps still build when you changed `packages/core`?
- [ ] Did `pnpm check` pass?

## Related

- [[AI/jobs/index]]: Role checklists for task review.
- [[AI/index]]: Entry point: pick the area you change and follow one link.
