# Frontend deprecation archive

This archive is append-only. Preserve exact replaced frontend documentation using [the deprecation template](../deprecation-template.md). No historical frontend documentation was replaced by this initial architecture bootstrap; no deprecation entries are fabricated.


## DEP-20261012-frontend-login-identifier

- Date: 2026-10-12T00:00:00-03:00
- Source: `AI/Architecture/front-end/shell-and-authentication.md`
- Original document ID: `architecture.frontend.shell-auth`
- Original section: `4. Contracts and behavior`
- Reason: Current login accepts usernames as well as email addresses.
- Replacement: `AI/Architecture/front-end/shell-and-authentication.md#4-contracts-and-behavior`
- Related code: `web/src/auth/login.ts`, `web/src/auth/auth.service.ts`
- Change reference: architecture bootstrap verification

### Exact previous content

````markdown
## 4. Contracts and behavior

`AuthService.init` fetches `/api/v1/config` directly before initial navigation. Missing auth configuration disables auth; config failure records `initError` while enabled remains true. The Supabase client persists sessions, refreshes tokens, and handles URL sessions. Recovery events navigate to `/redefinir-senha`; signed-out events clear data-cache storage and navigate to login. Guards protect pages when enabled; `safeRedirect` accepts only internal path forms. The interceptor attaches tokens to relative `/api/` calls except config, shares refresh across simultaneous 401s, retries once, then signs out on authentication failure.

`Login` offers login/signup/forgot/reset modes with required email/password fields as applicable, email format, eight-character password minimum and confirmation matching. GitHub visibility follows public config. Appearance supports system/light/dark, five accents, four built-in logos or uploaded PNG/JPEG/WebP/SVG up to 200 KiB. The store applies HTML data attributes and browser theme-color; initialization includes an index-page preference read before first paint.

````

## DEP-20261012-release-integration-pending-1

- Date: 2026-10-12T12:00:00-03:00
- Source: `AI/Architecture/front-end/shell-and-authentication.md`
- Original document ID: `architecture.frontend.shell-auth`
- Original section: `entire document`
- Reason: Synchronize the integrated application and append-only release contracts.
- Replacement: `AI/Architecture/front-end/shell-and-authentication.md`
- Related code: `api/src/releases.ts`, `web/src/finish-dialog.ts`, `AI/read-main-entry.mjs`
- Change reference: approved release integration

### Exact previous content

````markdown
---
id: architecture.frontend.shell-auth
title: Shell, authentication and appearance
type: module
area: frontend
status: active
owner: unknown
last_verified: 2026-10-12
source_paths:
  - web/src/main.ts
  - web/src/auth/auth.service.ts
  - web/src/auth/auth.guard.ts
  - web/src/auth/auth.interceptor.ts
  - web/src/auth/login.ts
  - web/src/appearance.ts
  - web/src/appearance-page.ts
  - web/src/logo.ts
  - web/src/index.html
related_domains:
  - domain.identity
tags: [angular, frontend]
---

# Shell, authentication and appearance

## 1. Purpose

Own application initialization, route access, account forms, shared navigation and local appearance preferences.

## 2. Scope and ownership

Includes the root shell, session signals, bearer interception, login/recovery UI, theme selection and branding. JWT validation and server authorization belong to security/backend.

## 3. Architecture map

| Responsibility           | Location                                                                 | Detail                  |
| ------------------------ | ------------------------------------------------------------------------ | ----------------------- |
| Bootstrap/navigation     | `web/src/main.ts`                                                        | `App`, router providers |
| Session lifecycle        | `web/src/auth/auth.service.ts`                                           | `AuthService`           |
| Route access/token retry | `web/src/auth/auth.guard.ts`, `web/src/auth/auth.interceptor.ts`         | Guards, interceptor     |
| Account forms            | `web/src/auth/login.ts`                                                  | `Login`                 |
| Visual preferences       | `web/src/appearance.ts`, `web/src/appearance-page.ts`, `web/src/logo.ts` | Store, editor, branding |

## 4. Contracts and behavior

`AuthService.init` fetches `/api/v1/config` directly before initial navigation. Missing auth configuration disables auth; config failure records `initError` while enabled remains true. The Supabase client persists sessions, refreshes tokens, and handles URL sessions. Recovery events navigate to `/redefinir-senha`; signed-out events clear data-cache storage and navigate to login. Guards protect pages when enabled; `safeRedirect` accepts only internal path forms. The interceptor attaches tokens to relative `/api/` calls except config, shares refresh across simultaneous 401s, retries once, then signs out on authentication failure.

`Login` offers login/signup/forgot/reset modes with required identifiers/passwords as applicable, an eight-character password minimum and confirmation matching. Login accepts an email address or a case-insensitive username matching `[a-z0-9._-]{3,32}`. `AuthService.signIn` trims input and maps usernames to their lowercase form plus `@gps.dev.br`; signup and password-recovery forms require an email address. GitHub visibility follows public config. Appearance supports system/light/dark, five accents, four built-in logos or uploaded PNG/JPEG/WebP/SVG up to 200 KiB. The store applies HTML data attributes and browser theme-color; initialization includes an index-page preference read before first paint.

## 5. Invariants

Tokens are not attached to external domains. Auth-disabled development allows protected routes. Password-recovery route is intentionally accessible without authGuard. Existing URLs and provider configuration field names remain unchanged.

## 6. Dependencies

Depends on Router, HttpClient interception, supabase-js, browser media queries/FileReader/storage and the public-config endpoint. Appearance derives user scope from AuthService.

## 7. Data and state

Session/user are signals mirrored from Supabase. Refresh has one shared in-flight promise. Appearance persists under per-user keys plus `checkpoint:appearance:last`; an unknown user's preferences start from current appearance. Appearance is browser-local and is not written to the API. Logout storage cleanup targets data-cache prefixes, not appearance or previous-desire storage.

## 8. Source references

`AuthService.init`, `accessToken`, `refreshToken`, `signOut`; `authGuard`, `guestGuard`, `safeRedirect`; `authInterceptor`, `retry`; `Login.submit`; `AppearanceStore`, `sanitize`, `readLogoFile`; `Logo.choice` in the source paths above.

## 9. Related documentation

[Frontend root](../front-end-architecture.md), [Security](../security-architecture.md), [Cache](../cache-architecture.md), [Identity domain](../domains/identity/domain.md).

## 10. Evidence and uncertainties

VERIFIED from inspected source. UNKNOWN: deployed OAuth settings, redirect allowlists and live session lifecycle. The store uses browser persistence rather than cross-device appearance synchronization. No frontend auth interaction tests were found.
````

## DEP-20261012-release-integration-pending-2

- Date: 2026-10-12T12:00:00-03:00
- Source: `AI/Architecture/front-end/library-and-game-detail.md`
- Original document ID: `architecture.frontend.library-detail`
- Original section: `entire document`
- Reason: Synchronize the integrated application and append-only release contracts.
- Replacement: `AI/Architecture/front-end/library-and-game-detail.md`
- Related code: `api/src/releases.ts`, `web/src/finish-dialog.ts`, `AI/read-main-entry.mjs`
- Change reference: approved release integration

### Exact previous content

````markdown
---
id: architecture.frontend.library-detail
title: Library browsing and game detail
type: module
area: frontend
status: active
owner: unknown
last_verified: 2026-10-11
source_paths:
  - web/src/library.ts
  - web/src/detail.ts
  - web/src/api.ts
  - web/src/immediate.ts
  - shared/models.ts
related_domains:
  - domain.game-library
  - domain.prioritization
tags: [angular, frontend]
---

# Library browsing and game detail

## 1. Purpose

Present the game catalog, browse server-filtered results and submit game assessments.

## 2. Scope and ownership

Library and detail own drafts/loading/errors; shared ImmediateButton owns immediate-desire interactions. Server validation, scoring and completion transitions remain domain/backend responsibilities.

## 3. Architecture map

| Responsibility      | Location               | Detail                     |
| ------------------- | ---------------------- | -------------------------- |
| Catalog browsing    | `web/src/library.ts`   | `Library.load`, `search`   |
| Editing             | `web/src/detail.ts`    | `Detail.show`, `save`      |
| HTTP/cache contract | `web/src/api.ts`       | `Api.list`, `game`, `save` |
| Immediate desire    | `web/src/immediate.ts` | `ImmediateButton.toggle`   |

## 4. Contracts and behavior

Library uses `/catalog` and `/games` under `/api/v1`, 250ms search debounce, server name/score/desire sorting, filters and 24-item pages. Cached values display immediately; request counters reject superseded responses. Search-query result pages are memory-only cache entries.

Detail requests game/catalog concurrently. `show` updates canonical game data but replaces the draft only if the draft and comma-separated tags remain untouched. Save trims/deduplicates secondary tags (maximum three), builds a patch from changed allowed fields, normalizes empty dates/predecessor to null, and includes `autoFinish` only when rating changes. Successful writes replace the game cache and invalidate game-dependent caches.

ImmediateButton emits optimistic desire changes, persists through `Api.setDesire`, emits saved after success, and emits the original desire plus an error on failure. Toggle selects `Imediata` or the remembered previous desire; absent previous desire falls back to `Muito Alta`.

## 5. Invariants

The UI does not calculate canonical scores. Server responses remain the source for persisted game state. Revalidation preserves an edited detail draft. Immediate desire is a server game mutation and affects every list's recommendations.

## 6. Dependencies

FormsModule, RouterLink, ActivatedRoute, Api and shared Game/ScoredGame/Catalog/GamePage models. Rating/completion and prerequisite behavior require domain discovery before changes.

## 7. Data and state

Signals hold displayed results and error/loading state; mutable cloned fields hold the draft. DataCache stores reads and propagates mutation invalidation. Previous desire is stored by game ID under `checkpoint:previous-desire`, without user scope or logout removal.

## 8. Source references

`Library.load`, `search`, `setDesire`; `Detail.load`, `show`, `save`; `Api.save`, `setDesire`, `rememberDesire`, `previousDesire`; `ImmediateButton.toggle`; `shared/models.ts`: `Game`, `GameStatus`, `Desire`.

## 9. Related documentation

[Frontend root](../front-end-architecture.md), [Queue interactions](queue-interactions.md), [Cache](../cache-architecture.md), [Game-library domain](../domains/game-library/domain.md), [Prioritization](../domains/prioritization/domain.md).

## 10. Evidence and uncertainties

VERIFIED from current source. UNKNOWN: browser races under concurrent editing and live backend changes. Detail uses the route snapshot for its initial game ID; route reuse behavior was not exercised. Previous-desire storage is not per-user despite the general data cache being per-user.
````

## DEP-20261012-release-integration-pending-3

- Date: 2026-10-12T12:00:00-03:00
- Source: `AI/Architecture/front-end/queue-interactions.md`
- Original document ID: `architecture.frontend.queue`
- Original section: `entire document`
- Reason: Synchronize the integrated application and append-only release contracts.
- Replacement: `AI/Architecture/front-end/queue-interactions.md`
- Related code: `api/src/releases.ts`, `web/src/finish-dialog.ts`, `AI/read-main-entry.mjs`
- Change reference: approved release integration

### Exact previous content

````markdown
---
id: architecture.frontend.queue
title: Queue interactions
type: component
area: frontend
status: active
owner: unknown
last_verified: 2026-10-11
source_paths:
  - web/src/queue.ts
  - web/src/api.ts
  - web/src/immediate.ts
  - shared/models.ts
related_domains:
  - domain.prioritization
tags: [angular, frontend]
---

# Queue interactions

## 1. Purpose

Render recommendations and support accessible manual ordering with optimistic interaction and canonical reconciliation.

## 2. Scope and ownership

Includes client search, paging, pointer/touch/keyboard drag, immediate desire controls, pins and manual reset. Scoring, pin invariants and durable writes are server-owned.

## 3. Architecture map

| Responsibility        | Location               | Detail                                             |
| --------------------- | ---------------------- | -------------------------------------------------- |
| Rendering/search/drag | `web/src/queue.ts`     | `Queue`                                            |
| Network/cache         | `web/src/api.ts`       | `queue`, `reorder`, `rememberQueue`, `resetManual` |
| Desire shortcut       | `web/src/immediate.ts` | `ImmediateButton`                                  |

## 4. Contracts and behavior

Queue follows `/ordem/:listId`, shows cached recommendations then revalidates, and displays 30 rows per expansion. Search matches all folded query words against name, genre, tags, mechanic and pace; it preserves original positions and disables drag. Fresh network responses reconcile settings configVersion. A user recalculation or error recovery can force a network read.

Drag supports pointer capture, 320ms touch long press, keyboard pickup/move/drop/cancel, announcements, reduced motion, scrolling and FLIP animation. Drop reorders locally and remembers the optimistic queue in DataCache. Requests POST `/lists/{id}/queue/reorder` serially with gameId/toPosition. Acceptance completes the HTTP request before durable background work; after submissions settle, a 1200ms delayed forced reread reconciles scores/order. Request failures force reload; busy interactions defer reconciliation by 800ms. Reset DELETEs `/queue/adjustments/{gameId}` and uses returned Recommendations.

Immediate desire changes optimistically move an unpinned item after existing immediate/pinned entries; saved forces an animated canonical reread.

## 5. Invariants

Filtered search never renumbers the canonical queue. Updates from another list or during drag/pending moves are ignored. Manual pin status and prerequisite warnings come from server QueueEntry fields. Reorder acceptance is not a durable-save receipt.

## 6. Dependencies

Depends on Api, ScoringSettingsStore, ListPicker/routeListId, browser layout/pointer/animation APIs and shared Recommendations/QueueEntry/ReorderAccepted contracts.

## 7. Data and state

Signals own displayed queue, visible count, query, errors, announcements and busy IDs. Private drag state owns measured DOM geometry. A promise chain preserves submission order. DestroyRef cleans host/window listeners, pending drag, flash and refresh timers. Browser cache can contain an optimistic queue until forced server reconciliation.

## 8. Source references

`Queue.shown`, `load`, `setDesire`, `drop`, `save`, `settle`, `refreshQuietly`, `resetManual`, `flipTo`; `Api.rememberQueue`, `reorder`; `shared/models.ts`: `QueueEntry`, `ReorderAccepted`, `ManualResetResult`.

## 9. Related documentation

[Frontend root](../front-end-architecture.md), [Lists and settings](lists-and-scoring-settings.md), [Library/detail](library-and-game-detail.md), [Backend](../back-end-architecture.md), [Cache](../cache-architecture.md), [Prioritization domain](../domains/prioritization/domain.md).

## 10. Evidence and uncertainties

VERIFIED from inspected source; API manual/list tests support route contracts but do not exercise drag UI. UNKNOWN: browser accessibility behavior and background write completion under slow infrastructure. A fixed reconciliation delay may observe server state before background processing finishes.
````

## DEP-20261012-release-integration-pending-4

- Date: 2026-10-12T12:00:00-03:00
- Source: `AI/Architecture/front-end/lists-and-scoring-settings.md`
- Original document ID: `architecture.frontend.list-settings`
- Original section: `entire document`
- Reason: Synchronize the integrated application and append-only release contracts.
- Replacement: `AI/Architecture/front-end/lists-and-scoring-settings.md`
- Related code: `api/src/releases.ts`, `web/src/finish-dialog.ts`, `AI/read-main-entry.mjs`
- Change reference: approved release integration

### Exact previous content

````markdown
---
id: architecture.frontend.list-settings
title: Lists and scoring settings
type: module
area: frontend
status: active
owner: unknown
last_verified: 2026-10-11
source_paths:
  - web/src/lists.ts
  - web/src/settings.ts
  - web/src/scoring-settings.ts
  - web/src/data-cache.ts
  - shared/models.ts
related_domains:
  - domain.prioritization
tags: [angular, frontend]
---

# Lists and scoring settings

## 1. Purpose

Select named recommendation lists and edit each list's scoring configuration.

## 2. Scope and ownership

Owns list navigation/CRUD UI, scoring draft validation and settings-cache usage. All lists reference the user's shared game library; weights, rules, filters and manual positions vary per list.

## 3. Architecture map

| Responsibility           | Location                      | Detail                                    |
| ------------------------ | ----------------------------- | ----------------------------------------- |
| List store/picker/routes | `web/src/lists.ts`            | `ListsStore`, `ListPicker`, `routeListId` |
| Settings editor          | `web/src/settings.ts`         | `Settings`                                |
| Settings contract/cache  | `web/src/scoring-settings.ts` | `ScoringSettingsStore`                    |

## 4. Contracts and behavior

`ListsStore.ensure` scopes loading by current user, delivers cached nonempty lists immediately and revalidates through DataCache. Create/rename/delete update the shared signal and list cache; deletion drops queue/settings entries. Missing or unknown list route parameters navigate to the last selected existing list or first list using replaceUrl. The picker trims names, enforces required input/60-character UI limit, displays server errors, confirms deletion and disables deletion when only one list remains.

Settings clones the server config. Dirty compares serialized configs; invalid checks factor min/max and hour constraints (0–10000, min <= max). Save PUTs `/lists/{id}/settings/scoring`; reset POSTs its `/reset` suffix. Both reread canonical settings and invalidate that list's queue. `syncVersion` drops settings when fresh recommendations report a different version.

## 5. Invariants

List names do not define membership subsets. Editable factors and defaults come from API metadata. UI eligibility prose does not replace backend eligibility enforcement.

## 6. Dependencies

Depends on AuthService for owner changes, Router/ActivatedRoute for list identity, DataCache and list/scoring endpoints. Shared models define GameList, ScoringConfig, ScoringSettings and FilterOptions.

## 7. Data and state

List signal and remembered `lastId` are shared root state; lastId is memory-only. Settings retains canonical settings and cloned draft signals. `ScoringSettingsStore.get` accepts valid nonstale cached settings without the general 60-second freshness limit; persisted entries still face DataCache's seven-day load limit. Version comparison occurs through fresh queue responses; there is no independent cross-device subscription.

## 8. Source references

`ListsStore.ensure`, `create`, `rename`, `remove`; `routeListId`; `ListPicker.submit`, `remove`; `Settings.invalid`, `hoursValid`, `save`, `restoreDefaults`; `ScoringSettingsStore.get`, `changed`, `syncVersion`.

## 9. Related documentation

[Frontend root](../front-end-architecture.md), [Queue interactions](queue-interactions.md), [Cache](../cache-architecture.md), [Prioritization domain](../domains/prioritization/domain.md).

## 10. Evidence and uncertainties

VERIFIED from source. UNKNOWN: cross-tab synchronization and network failure behavior during cached list revalidation in a browser. Settings can remain stale until explicit mutation or queue version reconciliation. Route loading failures are swallowed by routeListId while picker/page operations expose their own errors.
````

## DEP-20261012-release-integration-pending-5

- Date: 2026-10-12T12:00:00-03:00
- Source: `AI/Architecture/front-end-architecture.md`
- Original document ID: `architecture.frontend`
- Original section: `entire document`
- Reason: Synchronize the integrated application and append-only release contracts.
- Replacement: `AI/Architecture/front-end-architecture.md`
- Related code: `api/src/releases.ts`, `web/src/finish-dialog.ts`, `AI/read-main-entry.mjs`
- Change reference: approved release integration

### Exact previous content

````markdown
---
id: architecture.frontend
title: Frontend architecture
type: architecture-root
area: frontend
status: active
owner: unknown
last_verified: 2026-10-11
source_paths:
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

| Responsibility                  | Location                                                    | Detail                                                            |
| ------------------------------- | ----------------------------------------------------------- | ----------------------------------------------------------------- |
| Bootstrap, identity, appearance | `web/src/main.ts`, `web/src/auth/`, `web/src/appearance.ts` | [Shell and authentication](front-end/shell-and-authentication.md) |
| Browse and edit games           | `web/src/library.ts`, `web/src/detail.ts`                   | [Library and detail](front-end/library-and-game-detail.md)        |
| Lists and scoring controls      | `web/src/lists.ts`, `web/src/settings.ts`                   | [Lists and scoring](front-end/lists-and-scoring-settings.md)      |
| Queue search and reorder        | `web/src/queue.ts`                                          | [Queue interactions](front-end/queue-interactions.md)             |
| Acquisition and Steam UI        | `web/src/wishlist.ts`                                       | [Wishlist](front-end/wishlist.md)                                 |

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
````

## DEP-20261012-release-integration-pending-6

- Date: 2026-10-12T12:00:00-03:00
- Source: `AI/Architecture/domains/game-library/domain.md`
- Original document ID: `domain.game-library`
- Original section: `entire document`
- Reason: Synchronize the integrated application and append-only release contracts.
- Replacement: `AI/Architecture/domains/game-library/domain.md`
- Related code: `api/src/releases.ts`, `web/src/finish-dialog.ts`, `AI/read-main-entry.mjs`
- Change reference: approved release integration

### Exact previous content

````markdown
---
id: domain.game-library
title: Personal game library
type: domain
status: active
classification: supporting
last_verified: 2026-10-12
source_paths:
  - shared/models.ts
  - api/src/service.ts
  - api/src/pg-repository.ts
  - api/test/service.test.ts
related_domains: [domain.prioritization, domain.wishlist, domain.identity]
---

# Personal game library

## 1. Business purpose

Track a person’s games, play progress, ratings and metadata used for prioritization.

## 2. Bounded context

Observed capability boundary: personal play state and shared catalogue details. It shares the Game transport interface and GameService with prioritization/wishlist; this map does not establish independent DDD bounded contexts.

## 3. Ubiquitous language

| Term   | Meaning                                                 | Source            |
| ------ | ------------------------------------------------------- | ----------------- |
| Game   | catalogue and personal-state projection                 | shared/models.ts  |
| Status | Não iniciado, Jogando, Abandonado, Finalizado, Desejado | GameStatus        |
| Desire | subjective play urgency                                 | Desire            |
| Rating | numeric 1..5 preference feedback                        | GameService.patch |

## 4. Model

Game is a plain interface, not an aggregate-root class. Pg projects global game metadata together with library_entry owner state. GameService is application orchestration; repository interfaces separate persistence. No explicit value-object or aggregate enforcement layer was found.

## 5. Business invariants

Editable fields are allowlisted. Hours require finite numbers 0..100000 or null; ratings require 1..5 or null, dates require actual YYYY-MM-DD, tags allow at most three nonempty strings. A prerequisite cannot refer to the edited game itself. Series cycles are handled by recommendation exclusion rather than patch graph validation.

## 6. Use cases and workflows

Browse/filter library, inspect details, edit metadata/desire/rating/progress, and derive catalog vocabulary. Changed non-null rating auto-completes unless autoFinish=false; desire-only edits preserve prior rating/status. Completing a game removes pins in all lists after game persistence.

## 7. State transitions

All five status values are accepted by patch; no restricted transition graph is enforced. Finalized status fills an absent finish date. Explicit non-finalized status clears finish date unless supplied. A rating equal to the existing value does not itself trigger completion.

## 8. Domain events

No domain-event publisher exists. Queue move history is persisted audit data, described under prioritization, rather than a published event stream.

## 9. Interfaces and integration

[HTTP API](../../back-end/http-api.md) exposes game GET/PATCH and catalog. [Frontend library/detail](../../front-end/library-and-game-detail.md) consumes them. [Wishlist](../wishlist/domain.md) creates games.

## 10. Persistence

[Persistence](../../database/persistence.md) owns global catalogue versus personal library rows. JSON mode stores the merged Game projection. Completion and pin cleanup are not one transaction.

## 11. Dependencies and context map

Identity supplies owner; wishlist supplies desired games; prioritization consumes ratings, completed history, hours and metadata. Shared catalogue edits can affect other users sharing a game.

## 12. Implementation references

`shared/models.ts`: Game/GameStatus/Desire; `api/src/service.ts`: patch/catalog/all; `api/src/pg-repository.ts`: PgGameRepository.save; api/test/service.test.ts.

## 13. Linked subdomains

N/A. Technical details are in [application service](../../back-end/game-service.md) and [persistence](../../database/persistence.md).

## 14. Unknowns and inconsistencies

VERIFIED behavioral capability; supporting classification is an architectural interpretation. UNKNOWN: business-owner confirmation of context boundaries. Saving a game then failing pin cleanup can leave residual pins.
````
