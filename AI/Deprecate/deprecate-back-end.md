# Backend deprecation history

Append-only archive for superseded architectural facts. No prior documented facts were removed during initial bootstrap; no historical entries are fabricated. Follow [the deprecation template](../deprecation-template.md).


## DEP-20261012-steam-attempt-count

- Date: 2026-10-12T00:51:22-03:00
- Source: `AI/Architecture/back-end/wishlist-steam.md`
- Original document ID: `architecture.backend.wishlist-steam`
- Original section: `7. Data and state`
- Reason: Correct three total attempts to two possible retries.
- Replacement: `AI/Architecture/back-end/wishlist-steam.md#7-data-and-state`
- Related code: `api/src/steam.ts`
- Change reference: plan1.md independent bootstrap audit

### Exact previous content

````markdown
## 7. Data and state

Details fetch in sequential batches of 50 with parallel tag loading. getJson uses per-attempt eight-second timeout, up to three transient retries; generic retry defaults remain five elsewhere. Pg initial acquisition transaction precedes a separate new-catalog GameRepository.save, allowing partial success.

````

### Metadata correction for DEP-20261012-steam-attempt-count

- Corrected original document ID: `architecture.backend.wishlist`
- Reason: The initial provenance field used the filename suffix; the inspected stable YAML ID is architecture.backend.wishlist. The exact historical content remains unchanged.

## DEP-20261012-release-integration-pending-9

- Date: 2026-10-12T12:00:00-03:00
- Source: `AI/Architecture/back-end/http-api.md`
- Original document ID: `architecture.backend.http`
- Original section: `entire document`
- Reason: Synchronize the integrated application and append-only release contracts.
- Replacement: `AI/Architecture/back-end/http-api.md`
- Related code: `api/src/releases.ts`, `web/src/finish-dialog.ts`, `AI/read-main-entry.mjs`
- Change reference: approved release integration

### Exact previous content

````markdown
---
id: architecture.backend.http
title: HTTP API contracts
type: module
area: backend
status: active
owner: unknown
last_verified: 2026-10-12
source_paths:
  - api/src/server.ts
  - api/src/wishlist-routes.ts
  - api/src/context.ts
  - shared/models.ts
related_domains: [domain.game-library, domain.prioritization, domain.wishlist, domain.identity]
tags: [backend]
---

# HTTP API contracts

## 1. Purpose

Describe transport routing, validation and response contracts.

## 2. Scope and ownership

Owns HTTP dispatch and envelopes. Services own business validation; security owns token verification.

## 3. Architecture map

| Routes under /api/v1                                     | Methods                | Handler       |
| -------------------------------------------------------- | ---------------------- | ------------- |
| health, openapi.json, config, version                    | Public dispatch        | makeServer    |
| catalog, games, games/{id}                               | GET; detail PATCH      | GameService   |
| lists, lists/{id}                                        | GET/POST; PATCH/DELETE | GameService   |
| recommendations, queue/reorder, queue/adjustments        | GET; POST; GET         | GameService   |
| queue/adjustments/{gameId}                               | DELETE                 | resetManual   |
| settings/scoring, settings/scoring/reset                 | GET/PUT; POST          | GameService   |
| steam/search, steam/apps/{appId}                         | GET                    | wishlistRoute |
| wishlist, wishlist/import-steam, wishlist/prices/refresh | GET/POST; POST; POST   | wishlistRoute |

## 4. Contracts and behavior

Queue and scoring routes also accept `/lists/{listId}` before their suffix; absent list scope uses the oldest list. Game GET supports normalized name/tag search, exact status/primaryGenre/store filtering, name/score/desire sorting and pagination capped at 100 items. Wishlist create returns 201 when created and 200 for existing. List delete returns 204. Unknown API routes return 404; unsupported methods generally reach that fallback.

## 5. Invariants

JSON bodies must be objects, not arrays or null; malformed JSON returns 400. Accumulated decoded body string length above 100000 returns 413. JSON/204 API responses use Cache-Control no-store. Reorder returns HTTP 200 acceptance before background persistence.

## 6. Dependencies

`makeServer` invokes GameService, optional WishlistService and Authenticator. [Authentication](../security/authentication-and-ownership.md) runs after public endpoints and before protected /api routing.

## 7. Data and state

Each request runs in AsyncLocalStorage. AppError determines status; other exceptions produce 500. Envelope is `{ error: { message } }`, including Error.message. Non-API GET requests serve built frontend files with an index.html fallback.

## 8. Source references

`api/src/server.ts`: makeServer/readJson/send; `api/src/wishlist-routes.ts`: wishlistRoute; `shared/models.ts`: transport interfaces. HTTP coverage exists in api/test/service.test.ts, lists.test.ts, settings.test.ts, manual.test.ts and steam.test.ts.

## 9. Related documentation

[Backend root](../back-end-architecture.md), [service](game-service.md), [wishlist](wishlist-steam.md), [background reordering](background-reordering.md).

## 10. Evidence and uncertainties

VERIFIED routes from executable dispatch, rather than assuming docs/openapi.json is complete. UNKNOWN: live request behavior in deployment. Tests were inspected during discovery, not executed by this author.
````

## DEP-20261012-release-integration-pending-10

- Date: 2026-10-12T12:00:00-03:00
- Source: `AI/Architecture/back-end-architecture.md`
- Original document ID: `architecture.backend`
- Original section: `entire document`
- Reason: Synchronize the integrated application and append-only release contracts.
- Replacement: `AI/Architecture/back-end-architecture.md`
- Related code: `api/src/releases.ts`, `web/src/finish-dialog.ts`, `AI/read-main-entry.mjs`
- Change reference: approved release integration

### Exact previous content

````markdown
---
id: architecture.backend
title: Backend architecture
type: architecture-root
area: backend
status: active
owner: unknown
last_verified: 2026-10-12
source_paths:
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

| Responsibility          | Location              | Detail                                                     |
| ----------------------- | --------------------- | ---------------------------------------------------------- |
| HTTP composition        | `api/src/server.ts`   | [HTTP API](back-end/http-api.md)                           |
| Game/list orchestration | `api/src/service.ts`  | [Application service](back-end/game-service.md)            |
| Adapter selection       | `api/src/setup.ts`    | [Persistence adapters](back-end/persistence-adapters.md)   |
| Deferred moves          | `api/src/service.ts`  | [Background reordering](back-end/background-reordering.md) |
| Acquisition integration | `api/src/wishlist.ts` | [Wishlist and Steam](back-end/wishlist-steam.md)           |

## 4. Contracts and behavior

Custom `node:http` routing invokes constructor-injected services. The standalone entry listens; the Vercel JavaScript entry forwards requests to the same Server listener. `createService` selects PostgreSQL with DATABASE_URL and JSON otherwise.

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
````

## DEP-20261012-release-integration-pending-11

- Date: 2026-10-12T12:00:00-03:00
- Source: `AI/Architecture/back-end/persistence-adapters.md`
- Original document ID: `architecture.backend.adapters`
- Original section: `entire document`
- Reason: Synchronize the integrated application and append-only release contracts.
- Replacement: `AI/Architecture/back-end/persistence-adapters.md`
- Related code: `api/src/releases.ts`, `web/src/finish-dialog.ts`, `AI/read-main-entry.mjs`
- Change reference: approved release integration

### Exact previous content

````markdown
---
id: architecture.backend.adapters
title: Repository ports and adapters
type: module
area: backend
status: active
owner: unknown
last_verified: 2026-10-12
source_paths:
  - api/src/setup.ts
  - api/src/repository.ts
  - api/src/pg-repository.ts
  - api/src/list-repository.ts
  - api/src/manual-repository.ts
  - api/src/settings-repository.ts
  - api/src/wishlist-repository.ts
related_domains: [domain.game-library, domain.prioritization, domain.wishlist]
tags: [backend]
---

# Repository ports and adapters

## 1. Purpose

Map service repository interfaces to JSON and PostgreSQL implementations.

## 2. Scope and ownership

Owns application-facing adapter contracts. [Database persistence](../database/persistence.md) owns schema, SQL relationships and storage details.

## 3. Architecture map

| Port                       | Local implementation            | PostgreSQL implementation    |
| -------------------------- | ------------------------------- | ---------------------------- |
| GameRepository             | LocalGameRepository             | PgGameRepository             |
| ListRepository             | LocalListRepository             | PgListRepository             |
| ManualAdjustmentRepository | LocalManualAdjustmentRepository | PgManualAdjustmentRepository |
| ScoringConfigRepository    | LocalScoringConfigRepository    | PgScoringConfigRepository    |
| QueueInputsReader          | None                            | PgQueueInputsReader          |
| WishlistStore              | LocalWishlistStore              | PgWishlistStore              |

## 4. Contracts and behavior

createService imports adapters on demand. Local games merge persisted rows over a seed snapshot; app-created games are included. Local old unscoped settings/pins migrate in memory to LOCAL_DEFAULT_LIST_ID. Stored scoring values are tolerated through default substitution. PgQueueInputsReader loads list, entire owner library, pins and settings in one SQL statement.

## 5. Invariants

Local reads clone mutable game/list/settings data. JSON files use temporary-file rename, without cross-process locking. Pg operations enforce identity through the resolver and query predicates/constraints.

## 6. Dependencies

Pg adapters depend on Sql and AppUserResolver. Local adapters depend on filesystem promises. Both serve GameService; WishlistStore supplements GameRepository with acquisition and prices.

## 7. Data and state

Game/manual/wishlist local writes have Promise serialization; list/settings local writes do not. Memory may change before disk write succeeds. Local list removal leaves its separate settings/manual records; Pg list deletion cascades. Local move deduplication is limited by retained history.

## 8. Source references

`api/src/setup.ts`: createService; `api/src/pg-repository.ts`: PgQueueInputsReader/PgManualAdjustmentRepository; local adapter classes in listed files.

## 9. Related documentation

[Backend root](../back-end-architecture.md), [database](../database-architecture.md), [identity](../domains/identity/domain.md), [background ordering](background-reordering.md).

## 10. Evidence and uncertainties

VERIFIED adapter differences. These local adapters are development/test storage, not a multi-process transactional store. UNKNOWN: applied hosted schema.
````
