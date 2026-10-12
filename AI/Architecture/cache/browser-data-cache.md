---
id: architecture.cache.browser
title: Browser data cache
type: module
area: cache
status: active
owner: unknown
last_verified: 2026-10-12
source_paths:
  - web/src/data-cache.ts
  - web/src/api.ts
  - web/src/scoring-settings.ts
  - web/src/wishlist-api.ts
  - web/src/lists.ts
  - web/src/auth/auth.service.ts
related_domains: [domain.game-library, domain.prioritization, domain.wishlist, domain.identity]
tags: [cache]
---

# Browser data cache

## 1. Purpose

Document cache keys, revalidation and mutation dependencies.

## 2. Scope and ownership

Owns DataCache memory/localStorage behavior. UI-specific optimistic moves belong to [queue interactions](../front-end/queue-interactions.md).

## 3. Architecture map

| Key suffix                         | Content               | Scope         |
| ---------------------------------- | --------------------- | ------------- |
| catalog / lists / wishlist         | collections           | user          |
| games?{parameters} / game:{id}     | library pages/details | user          |
| queue:{listId} / settings:{listId} | queue/configuration   | user and list |

## 4. Contracts and behavior

Full key is `checkpoint:cache:{auth-user-id-or-local}:{suffix}`. get/swr use fresh entries for 60000ms; swr delivers cached state first and then refreshed values when stale, absent or forced. Equal in-flight keys share a promise. localStorage hydration ignores entries older than seven days; already-loaded memory entries do not have that maximum-age check. Typed searches remain memory-only.

## 5. Invariants

Owner changes clear memory and in-flight registries. Logout clears current and legacy scoring-cache storage prefixes. invalidate marks matching prefixes stale and advances a signal; drop removes matching entries. These operations do not cancel pending fetch promises.

## 6. Dependencies

Api, ListsStore, WishlistApi and ScoringSettingsStore depend on DataCache. DataCache obtains scope from AuthService. Browser responses depend on server no-store requests, rather than HTTP response caching.

## 7. Data and state

Game edits and wishlist add/import invalidate games?, game:, queue:, catalog and wishlist. Settings save/reset invalidates that list queue and reloads settings. Reset pin stores returned recommendations. Deleted lists drop their queue/settings. ScoringSettingsStore accepts valid non-stale settings without the general freshness window; queue configVersion mismatch drops settings. Quota failure evicts the oldest half of persisted cache entries and retries, otherwise retains memory only.

## 8. Source references

`web/src/data-cache.ts`: DataCache/keys/GAME_DEPENDENTS/clearDataCache; `web/src/api.ts`: Api.save/rememberQueue; `web/src/scoring-settings.ts`: syncVersion; `web/src/wishlist-api.ts`: changed.

## 9. Related documentation

[Cache root](../cache-architecture.md), [frontend](../front-end-architecture.md), [list/settings UI](../front-end/lists-and-scoring-settings.md), [prioritization](../domains/prioritization/domain.md).

## 10. Evidence and uncertainties

VERIFIED current DataCache replaced the older scoring-cache module during discovery. INFERRED risks: an earlier in-flight response can overwrite an invalidation, and settings filterOptions may remain stale after library changes because GAME_DEPENDENTS omits settings. Neither race was reproduced.
