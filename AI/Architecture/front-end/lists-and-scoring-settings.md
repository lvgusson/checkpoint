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

`ListsStore.ensure` scopes loading by current user, delivers cached nonempty lists immediately and revalidates through DataCache. Create/rename/delete update the shared signal and list cache; deletion drops queue/settings entries. Missing or unknown list route parameters navigate to the last selected existing list or first list using replaceUrl. The picker presents create, rename, and delete in a native details menu with 44px targets; its select retains an accessible label and it accepts projected page controls. The picker trims names, enforces required input/60-character UI limit, displays server errors, confirms deletion and disables deletion when only one list remains.

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
