---
id: architecture.backend.http
title: HTTP API contracts
type: module
area: backend
status: active
owner: unknown
last_verified: 2026-10-12
source_paths:
  - api/src/releases.ts
  - api/test/releases.test.ts
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
| releases, releases/latest                                | GET/POST; GET          | releaseRoute  |
| catalog, games, games/{id}                               | GET; detail PATCH      | GameService   |
| lists, lists/{id}                                        | GET/POST; PATCH/DELETE | GameService   |
| recommendations, queue/reorder, queue/adjustments        | GET; POST; GET         | GameService   |
| queue/adjustments/{gameId}                               | DELETE                 | resetManual   |
| settings/scoring, settings/scoring/reset                 | GET/PUT; POST          | GameService   |
| steam/search, steam/apps/{appId}                         | GET                    | wishlistRoute |
| wishlist, wishlist/import-steam, wishlist/prices/refresh | GET/POST; POST; POST   | wishlistRoute |

## 4. Contracts and behavior

Release routes precede user authentication: GET is public metadata, POST uses the dedicated release token. Collection GET accepts environment (production by default), limit (1–100, default 20), and before (exclusive release ID); it returns items and nextBefore. Latest returns the highest registered ID in that environment, or 404. POST accepts description (3–500 characters), optional name (1–80), non-rollback kind, environment, gitRef (1–200), and either version or bump. gitSha must contain all 40 hexadecimal characters and is normalized to lowercase. Unknown fields and invalid values return 400. Creation returns 201; an existing ordinary commit/environment returns 200 with created=false. Explicit versions must exceed the latest version or return 409. Unsupported collection methods return 405 with Allow: GET, POST; latest permits only GET. Without PostgreSQL release storage, supported routes return 503. Latest registration is distinct from deployment evidence.

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
