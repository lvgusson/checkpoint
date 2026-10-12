---
id: architecture.domain.prioritization.scoring
title: Scoring and fixed positions
type: component
area: domain
status: active
owner: unknown
last_verified: 2026-10-12
source_paths:
  - api/src/scoring.ts
  - api/src/scoring-config.ts
  - api/test/scoring.test.ts
  - api/test/manual.test.ts
  - api/test/settings.test.ts
related_domains: [domain.prioritization, domain.game-library]
tags: [scoring, prerequisites, pins]
---

# Scoring and fixed positions

## 1. Purpose

Specify actual scoring, eligibility, contextual selection and manual ordering rules.

## 2. Scope and ownership

Canonical algorithm rules; [background persistence](../../back-end/background-reordering.md) owns retries/durability. Defaults are configurable through scoringFactors bounds, rather than constants agents should duplicate.

## 3. Architecture map

| Stage               | Symbol                    | Result                       |
| ------------------- | ------------------------- | ---------------------------- |
| Learning/base score | scoreGames                | scored games and time factor |
| Content filtering   | contentFilter             | first exclusion reason       |
| Contextual queue    | recommendGames/contextual | greedy order                 |
| Manual merge        | orderPins/recommendGames  | fixed positions              |
| Drag planning       | planMove                  | changed pins                 |
| Options             | filterOptions             | pre-content-filter counts    |

## 4. Contracts and behavior

Duration estimate uses the first positive finite extraHours, mainHours, previousEstimatedHours; completionistHours is excluded. Completed finite campaigns with actual/estimate ratios train a median factor: (2 + n × median)/(2 + n), clamped 0.5..2; disabled or no examples gives 1. Eligible pending campaigns use rounded estimate × factor; other finite games keep the estimate and endless games have null planned hours.

Affinity averages genre, pace and mechanic preference. Each preference uses (neutralAffinity × priorStrength + sum(25 × (rating − 1)))/(priorStrength + matched ratings). All rated games in range 1..5 can contribute; absent rating is not zero. Duration contribution input is 50 without an estimate, otherwise clamp(100 + freeDurationHours − plannedHours, 0, 100).

Base score is the sum of enabled weighted desire, affinity and duration. Defaults are desire 0.5, affinity 0.35, duration 0.15; desire values are Imediata/Muito Alta=100, Alta=75, Média=50, Baixa=25, Muito Baixa=0. Imediata's precedence is a selection rule, not a larger base weight.

| Context rule       | Default contribution / condition                                      |
| ------------------ | --------------------------------------------------------------------- |
| inProgress         | +8 for Jogando                                                        |
| repeatGenre        | −18 matching previous normalized genre                                |
| repeatGenreTwoBack | −8 matching two-back genre                                            |
| repeatMechanic     | −10 matching previous mechanic                                        |
| repeatTag          | −8 × shared/max tag count with previous                               |
| repeatTagTwoBack   | −4 × shared/max tag count with two-back                               |
| consecutiveLong    | −24 when both current and previous reach longHours=40                 |
| longAfterHeavy     | −12 when current reaches 40 and last three hours reach recentHours=90 |
| repeatPace         | −6 matching normalized previous pace                                  |
| contrastingPace    | +8 alternating exact Calmo/Frenético labels                           |
| shortAfterLong     | +6 when previous reaches 40 and known current hours ≤ shortHours=12   |

Recent completed history requires finishedAt and keeps the latest three by date. Context uses completed actualHours when positive, otherwise plannedHours. Greedy picks update this history. At each position only available Imediata candidates compete when any exist; otherwise all available candidates compete. Largest contextual score wins; ties use ascending game ID.

Eligibility allows Não iniciado/Jogando; Abandonado only with excludeAbandoned off. Finalizado and Desejado never enter. Endless exclusion defaults on, competitive exclusion off. Competitive is a heuristic: normalized genre luta/esporte/mmorpg or mechanic esporte/progressao online.

Content filters support excluded genres/tags, allowed stores/paces, coopOnly, minimum desire and planned-hour limits. Text matching normalizes accents/trim/case. Unknown hours pass bounds unless excludeUnknownHours. Coop means nonempty and normalized value other than nao. minDesire configuration accepts Muito Alta through Muito Baixa or null; Imediata remains more urgent in ranking. filterOptions counts eligible candidates before content filtering.

## 5. Invariants

When prerequisites are enabled, an unselected predecessor still in the unpinned candidate set blocks selection. Selected predecessors permit selection; missing predecessors permit it; predecessors outside candidates are traversed without blocking. Cycles block affected candidates and yield excluded reasons. Content-filtered and pinned predecessors do not block like pending algorithm candidates.

Pins are ignored when manual is off. Only eligible, content-filtered-in games retain active pin effects. Latest pin per game wins; pin insertion order is ascending requested position, newest first on equal position. Pins are excluded from greedy selection and neighbor history, then inserted at their positions, clamped to the end and after earlier inserted pins. Surrounding contextual scores are not recalculated. Fixed entries use empty-history context, retaining possible inProgress bonus.

A pinned sequel may appear before a prerequisite and is flagged pinnedBeforePrerequisite. Displayed pinnedPosition is the actual merged position. Pins can precede algorithm Imediata entries. planMove reproduces remove/insert drag ordering and updates the dragged game's pin plus existing pins whose displayed indices changed.

## 6. Dependencies

Pure functions consume Game[], ScoringConfig and ManualPin[]. [Library](../game-library/domain.md) supplies ratings, history, durations and catalogue tags. [Application service](../../back-end/game-service.md) stamps listId and persisted configVersion.

## 7. Data and state

Outputs include explanations, adjustments, excluded content/cycle candidates, cumulative planned hours and total estimate; unknown hours contribute zero to totals. Status/endless/competitive exclusions are not all enumerated in excluded. Direct recommendGames configVersion is 0. String normalization memoization and object tag WeakMap are implementation caches, not persisted queue state.

Defaults: freeDurationHours=8, priorStrength=2, neutralAffinity=50; all rules except excludeCompetitive default on, content filters are neutral. Disabling contribution rules makes that contribution zero; disabling eligibility/prerequisite/manual rules changes the corresponding behavior. parseScoringConfig validates known keys/ranges, fills absent keys, requires weights/rules objects and accepts optional filters. storedScoringConfig tolerates invalid persisted entries through defaults.

## 8. Source references

api/src/scoring.ts: defaultWeights/defaultRules/defaultFilters/scoreGames/contentFilter/contextual/recommendGames/filterOptions/planMove. api/src/scoring-config.ts: scoringFactors/parseScoringConfig/storedScoringConfig. Tests cover learning, missing hours, cycles, urgency, filters, pin merge and shifted pins in api/test/scoring.test.ts, manual.test.ts and settings.test.ts.

## 9. Related documentation

[Prioritization domain](domain.md), [backend service](../../back-end/game-service.md), [queue UI](../../front-end/queue-interactions.md), [settings UI](../../front-end/lists-and-scoring-settings.md), [browser cache](../../cache/browser-data-cache.md).

## 10. Evidence and uncertainties

VERIFIED from executable functions and inspected tests. This is observed greedy behavior, not an optimal scheduling claim. UNKNOWN: business-owner acceptance of every heuristic. Tests were inspected, not executed in this documentation authoring task.
