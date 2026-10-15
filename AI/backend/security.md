---
name: security
description: API security boundaries and isolated security tests.
type: reference
area: backend
---

# Security and input validation

The API uses `main/server.ts` for HTTP requests and `main/data.ts` for storage selection.

## Storage and ownership

Private stores must use the same driver. Authenticated operation requires PostgreSQL for games, lists, pins, scoring, and accounts.
JSON stores support local development with one user. They do not provide ownership isolation.

PostgreSQL drivers filter private records by the caller's account ID. Services return 404 for foreign resources.
Shared game metadata and prices contain no private notes, hours, ratings, or library status.
The backend database role can bypass row security. API ownership filters remain necessary.
Migration 017 limits direct account updates to `display_name` for authenticated database clients.

## Request boundaries

- `main/server.ts` limits JSON bodies to 100,000 bytes. Invalid JSON returns 400.
- `routes/telemetry.ts` limits bodies to 16 KiB and accepts 60 batches per minute for each user.
- `routes/validation/` contains request schemas. Some routes retain service validation. Check actual imports before changing validation.
- `auth/rate-limit.ts` bounds identity counters and rejects new identities when the counter map is full.
- `shared/request-guard.ts` provides request and concurrency limits. Counters apply to one process.
- `routes/lists.ts` holds the reorder admission until the background work ends. The response remains immediate.
- Steam profile IDs must match SteamID64 syntax before the client constructs a request.
- Log redaction masks sensitive field names, bearer tokens, and query credentials, including Steam `key` values.
- Log destinations use bounded queues. Overflow drops the oldest waiting event and preserves the active write.

## Security tests

Run the focused regressions:

```bash
LOG_SINK=noop node --test apps/api/test/security-fixes.test.ts
```

Run the HTTP attack suites:

```bash
pnpm --filter @checkpoint/api run test:security
```

The test helper creates temporary JSON files for local HTTP tests. It does not inherit storage paths or credentials.
Ownership and SQL suites require `SECURITY_TEST_DATABASE_URL`. They skip explicitly when this variable is absent.
The URL must select a local database whose name starts with `checkpoint_security_`.
Never supply a production database. The orchestrator prepares the isolated database with migrations and seed data.

Ownership tests use PostgreSQL and two authenticated identities. They preserve the expected 404 response for foreign records.
SQL tests exercise attack examples against PostgreSQL. They cannot prove that every future query is safe.
Review every query change for parameters and fixed identifiers.

## Related

- [[AI/backend/backend]]: Backend request flow and notes.
- [[AI/backend/authorization]]: Roles and ownership rules.
- [[AI/backend/infrastructure]]: Storage, environment variables, and deployment.
- [[AI/backend/observability]]: Logging and destinations.
