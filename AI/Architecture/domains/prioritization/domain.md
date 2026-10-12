---
id: domain.prioritization
title: Play prioritization
type: domain
status: active
classification: core
last_verified: 2026-10-12
source_paths:
  - api/src/scoring.ts
  - api/src/scoring-config.ts
  - api/src/service.ts
  - shared/models.ts
  - api/test/manual.test.ts
  - api/test/settings.test.ts
related_domains: [domain.game-library, domain.identity]
---

# Play prioritization

## 1. Business purpose

Produce an explainable play queue adapted to desire, learned preferences, duration and recent play context.

## 2. Bounded context

Owns scoring, queue eligibility, list-specific configuration and fixed positions. Game-library state is upstream. This capability is tightly coupled to GameService and shared Game, not an independently deployed context.

## 3. Ubiquitous language

| Term        | Meaning                                                            | Source          |
| ----------- | ------------------------------------------------------------------ | --------------- |
| List        | named scoring/configuration/pin view over the entire owner library | GameList        |
| Queue       | ordered eligible games with reasons and cumulative hours           | Recommendations |
| Pin         | manually fixed displayed position                                  | ManualPin       |
| Time factor | learned multiplier for planned duration                            | scoreGames      |
| Affinity    | preference score learned from ratings                              | scoreGames      |

## 4. Model

Plain ScoringConfig, Recommendations, QueueEntry and ManualPin structures; scoreGames/recommendGames/planMove are pure domain calculations. Settings/pins/history are persisted by list. There is no aggregate-root object, value-object constructor or event bus.

## 5. Business invariants

Completed and desired games never enter the queue. List configurations are independent while games are shared. Configuration version increments per save/reset. Pin effects and prerequisite exceptions are specified canonically in [scoring and pins](scoring-and-pins.md).

## 6. Use cases and workflows

Read recommendation; save/reset scoring rules and filters; create/rename/delete lists; drag to pin; release a pin. Defaults reproduce baseline eligibility, except optional competitive exclusion defaults off.

## 7. State transitions

Configuration moves from unsaved defaults/version 0 to saved versions. Manual movement is validated, accepted, then persisted asynchronously. Reset synchronously removes a pin and returns recalculated queue. Finalizing an upstream game removes its pins across lists.

## 8. Domain events

queue_move_event records persisted moves/resets for audit and retry deduplication. It is not published to external consumers. No domain-event dispatch is implemented.

## 9. Interfaces and integration

[HTTP API](../../back-end/http-api.md) has default and explicit-list queue/settings routes. [Background reordering](../../back-end/background-reordering.md) owns acceptance/durability. [Queue UI](../../front-end/queue-interactions.md) handles optimistic state.

## 10. Persistence

[Database persistence](../../database/persistence.md) owns list/configuration/adjustment/event records. Recommendations are derived in memory; historical queue snapshot storage was removed by migration 008.

## 11. Dependencies and context map

Game library supplies learning data and eligibility fields; identity scopes lists and pins. Frontend/cache consumes configVersion to detect configuration changes. These relationships share contracts rather than independent context integration protocols.

## 12. Implementation references

`api/src/scoring.ts`: scoreGames/recommendGames/planMove/filterOptions; `api/src/scoring-config.ts`: parseScoringConfig/storedScoringConfig; `api/src/service.ts`: inputs/reorder; api/test/scoring.test.ts/manual.test.ts/settings.test.ts/lists.test.ts.

## 13. Linked subdomains

[Scoring and fixed positions](scoring-and-pins.md) is the canonical business-rule leaf.

## 14. Unknowns and inconsistencies

VERIFIED algorithm and list semantics. Core classification is inferred from the application’s purpose. UNKNOWN: business-owner validation. Pins can intentionally override series order; acknowledgment is not durable completion.
