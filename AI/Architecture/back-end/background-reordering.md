---
id: architecture.backend.reordering
title: Background reorder persistence
type: module
area: backend
status: active
owner: unknown
last_verified: 2026-10-12
source_paths:
  - api/src/service.ts
  - api/src/background.ts
  - api/src/retry.ts
  - api/src/pg-repository.ts
  - api/src/manual-repository.ts
  - api/test/manual.test.ts
related_domains: [domain.prioritization, domain.identity]
tags: [backend]
---

# Background reorder persistence

## 1. Purpose

Describe the acceptance, ordering and persistence guarantees of a manual queue move.

## 2. Scope and ownership

Owns asynchronous orchestration and failure semantics. [Scoring and pins](../domains/prioritization/scoring-and-pins.md) owns move-plan business semantics.

## 3. Architecture map

| Stage       | Symbol                          | Outcome                     |
| ----------- | ------------------------------- | --------------------------- |
| Validate    | GameService.reorder/planReorder | accepted or 4xx             |
| Keep alive  | runInBackground                 | Vercel waitUntil            |
| Retry       | persistMove/retry               | persisted or logged failure |
| Deduplicate | manual.pin                      | move UUID reused            |

## 4. Contracts and behavior

Reorder accepts a nonempty gameId up to 200 characters and integer position 1..100000, then validates current queue membership, actual bounds and enabled manual rule. Accepted response includes original/requested position; done continues after response and never intentionally rejects on final persistence failure. Retries re-read inputs and rebuild plans after the first attempt.

## 5. Invariants

HTTP 200 is validation acknowledgment, not a durability guarantee. Per-user serial chains apply within one GameService instance only. One generated move UUID persists across retries; different moves are not globally serialized.

## 6. Dependencies

Uses captured AsyncLocalStorage context, manual repository and @vercel/functions waitUntil. retry defaults: five total attempts, 200/400/800/1600ms delays. AppError stops retries; errors are logged.

## 7. Data and state

Pg pin writes atomically gate pin changes on insertion of a new user/client_request_id event. Local deduplication checks retained move history, default maximum 5000; Pg history query returns latest 500. No durable job queue, distributed lock, dead-letter consumer or completion event is implemented here.

## 8. Source references

`api/src/service.ts`: serial/reorder/persistMove/resetManual; `api/src/background.ts`: runInBackground; `api/src/retry.ts`: retry; `api/test/manual.test.ts`: immediate acceptance, retries, permanent failure and fast move tests.

## 9. Related documentation

[Backend root](../back-end-architecture.md), [queue UI](../front-end/queue-interactions.md), [database persistence](../database/persistence.md), [infrastructure](../infrastructure-architecture.md).

## 10. Evidence and uncertainties

VERIFIED process ordering and database idempotency. INFERRED operational risk: process interruption or permanent failure may lose an acknowledged move. UNKNOWN: distributed race frequency; idempotency is not distributed ordering.
