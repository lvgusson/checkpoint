---
id: architecture.backend
title: Backend architecture
type: architecture-root
area: backend
status: active
owner: unknown
last_verified: 2026-10-12
source_paths:
  - api/src/releases.ts
  - api/index.mjs
  - api/src/server.ts
  - api/src/setup.ts
  - api/src/service.ts
  - api/src/wishlist.ts
related_domains: [domain.game-library, domain.prioritization, domain.wishlist, domain.identity]
tags: [backend]
---

# Backend architecture

## 1. Purpose

Map the HTTP API, application orchestration, repositories and Steam integration.

## 2. Scope and ownership

Owns executable backend topology. Business rules belong to linked domain leaves; SQL storage and identity controls have separate canonical owners.

## 3. Architecture map

| Responsibility          | Location              | Detail                                                                               |
| ----------------------- | --------------------- | ------------------------------------------------------------------------------------ |
| HTTP composition        | `api/src/server.ts`   | [HTTP API](back-end/http-api.md)                                                     |
| Game/list orchestration | `api/src/service.ts`  | [Application service](back-end/game-service.md)                                      |
| Adapter selection       | `api/src/setup.ts`    | [Persistence adapters](back-end/persistence-adapters.md)                             |
| Deferred moves          | `api/src/service.ts`  | [Background reordering](back-end/background-reordering.md)                           |
| Release registrations   | `api/src/releases.ts` | [HTTP](back-end/http-api.md), [operations](infrastructure/deployment-and-release.md) |
| Acquisition integration | `api/src/wishlist.ts` | [Wishlist and Steam](back-end/wishlist-steam.md)                                     |

## 4. Contracts and behavior

ReleaseStore is a separate append-only metadata port with PostgreSQL persistence and a memory test adapter; it has no JSON production fallback. Custom `node:http` routing invokes constructor-injected services. The standalone entry listens; the Vercel JavaScript entry forwards requests to the same Server listener. `createService` selects PostgreSQL with DATABASE_URL and JSON otherwise.

## 5. Invariants

Lists configure views over the same owner library. Recommendations are computed from current inputs. HTTP reorder acceptance precedes persistence.

## 6. Dependencies

Backend depends on repository ports, the [prioritization model](domains/prioritization/domain.md), [identity](domains/identity/domain.md), and Steam reads.

## 7. Data and state

Request identity uses AsyncLocalStorage. Serverless instances retain independent process state. JSON and PostgreSQL have materially different consistency guarantees.

## 8. Source references

`api/index.mjs`: handler; `api/src/server.ts`: makeServer; `api/src/setup.ts`: createService; `api/src/service.ts`: GameService; `api/src/wishlist.ts`: WishlistService.

## 9. Related documentation

[Architecture index](architecture-index.md), [database](database-architecture.md), [security](security-architecture.md), [infrastructure](infrastructure-architecture.md), [frontend](front-end-architecture.md), [cache](cache-architecture.md).

## 10. Evidence and uncertainties

VERIFIED against listed code and inspected tests. UNKNOWN: deployed migration state and live integration availability. No production behavior was changed by this documentation.
