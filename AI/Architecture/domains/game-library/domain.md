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

Browse/filter library, inspect details, edit metadata/desire/rating/progress, and derive catalog vocabulary. Changed non-null rating auto-completes unless autoFinish=false; desire-only edits preserve prior rating/status. Completing a game removes pins in all lists after game persistence. The shared frontend finish dialog submits an explicit completion with rating, optional hours, notes, and the local finish date; its presentation contract is in [library/detail](../../front-end/library-and-game-detail.md).

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
