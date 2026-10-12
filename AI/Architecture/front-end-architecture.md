---
id: architecture.frontend
title: Frontend architecture
type: architecture-root
area: frontend
status: active
owner: unknown
last_verified: 2026-10-11
source_paths:
  - web/src/finish-dialog.ts
  - web/src/styles.css
  - web/src/main.ts
  - web/src/api.ts
  - web/src/data-cache.ts
  - angular.json
  - package.json
  - web/proxy.conf.json
  - vercel.json
related_domains:
  - domain.game-library
  - domain.prioritization
  - domain.wishlist
  - domain.identity
tags: [angular, frontend]
---

# Frontend architecture

## 1. Purpose

Map the Angular application and route agents to the smallest relevant frontend responsibility.

## 2. Scope and ownership

The standalone SPA lives in `web/src`; shared wire models live in `shared/models.ts`. Components own presentation state; the API owns business scoring and persistence.

## 3. Architecture map

| Responsibility                   | Location                                                    | Detail                                                            |
| -------------------------------- | ----------------------------------------------------------- | ----------------------------------------------------------------- |
| Bootstrap, identity, appearance  | `web/src/main.ts`, `web/src/auth/`, `web/src/appearance.ts` | [Shell and authentication](front-end/shell-and-authentication.md) |
| Browse and edit games            | `web/src/library.ts`, `web/src/detail.ts`                   | [Library and detail](front-end/library-and-game-detail.md)        |
| Lists and scoring controls       | `web/src/lists.ts`, `web/src/settings.ts`                   | [Lists and scoring](front-end/lists-and-scoring-settings.md)      |
| Queue search, finish and reorder | `web/src/queue.ts`                                          | [Queue interactions](front-end/queue-interactions.md)             |
| Acquisition and Steam UI         | `web/src/wishlist.ts`                                       | [Wishlist](front-end/wishlist.md)                                 |

## 4. Contracts and behavior

`bootstrapApplication` provides routing, HTTP interception, authentication initialization and appearance initialization. Protected routes cover `/jogos`, `/jogos/:id`, `/ordem[/listId]`, `/desejos`, `/configuracoes[/listId]`, and `/aparencia`; login and recovery have separate access behavior. Reads use same-origin HTTP contracts and browser caching; writes update or invalidate dependent cached data.

## 5. Invariants

Business eligibility and canonical recommendation order remain server responsibilities. Existing Portuguese URLs, enum values and wire field names are compatibility contracts.

## 6. Dependencies

Angular 22.2.2 standalone components, forms, router and HttpClient; RxJS promise conversion; supabase-js identity. `angular.json` uses the application builder with `dist/web` output. The development proxy forwards `/api/**` to port 3000; Vercel routes API requests and supplies SPA fallback.

## 7. Data and state

Component signals hold page state. Root services hold authentication, lists, scoring settings, appearance and browser data cache. Cache mechanisms are documented in [Cache architecture](cache-architecture.md). No NgRx or other separate state framework appears in inspected dependencies.

## 8. Source references

`web/src/main.ts`: `App`, `bootstrapApplication`; `web/src/api.ts`: `Api`; `web/src/data-cache.ts`: `DataCache`; `shared/models.ts`: shared contracts; `angular.json`: build/serve targets; `package.json`: scripts.

## 9. Related documentation

[Architecture index](architecture-index.md), [Backend](back-end-architecture.md), [Security](security-architecture.md), [Cache](cache-architecture.md), [Game library](domains/game-library/domain.md), [Prioritization](domains/prioritization/domain.md), [Wishlist domain](domains/wishlist/domain.md), [Identity](domains/identity/domain.md).

## 10. Evidence and uncertainties

VERIFIED against source on 2026-10-11. No frontend test files or Angular test target were found; `npm test` runs API tests, while the Angular build checks templates. UNKNOWN: deployed provider configuration and browser interaction behavior. Legacy README/design descriptions of three screens/no login are stale supporting evidence.
