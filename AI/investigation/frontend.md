# Frontend and repository investigation

```yaml
agent_id: frontend-discovery
scope: Repository cartography and frontend
status: complete
inspected_paths:
  - AI/main-entry.md
  - plan1.md
  - AI/architecture-contract.md
  - package.json
  - angular.json
  - tsconfig.app.json
  - tsconfig.api.json
  - web/proxy.conf.json
  - vercel.json
  - scripts/dev.mjs
  - api/index.mjs
  - api/src/server.ts
  - api/src/wishlist-routes.ts
  - shared/models.ts
  - web/src/main.ts
  - web/src/api.ts
  - web/src/data-cache.ts
  - web/src/library.ts
  - web/src/detail.ts
  - web/src/immediate.ts
  - web/src/queue.ts
  - web/src/lists.ts
  - web/src/settings.ts
  - web/src/scoring-settings.ts
  - web/src/wishlist.ts
  - web/src/wishlist-api.ts
  - web/src/auth/auth.service.ts
  - web/src/auth/auth.guard.ts
  - web/src/auth/auth.interceptor.ts
  - web/src/auth/login.ts
  - web/src/appearance.ts
  - web/src/appearance-page.ts
  - web/src/logo.ts
  - api/test/manual.test.ts
  - api/test/lists.test.ts
  - api/test/settings.test.ts
  - api/test/auth.test.ts
  - README.md
  - docs/design.md
  - eslint.config.js
  - .husky/pre-commit
  - .husky/commit-msg
verified_findings:
  - id: repository.topology
    statement: Single private ESM npm package combines Angular standalone SPA, native Node TypeScript API and shared models; no npm workspaces are declared.
    evidence:
      [
        { path: package.json, symbol: scripts },
        { path: scripts/dev.mjs, symbol: processes },
        { path: api/index.mjs, symbol: handler },
      ]
    confidence: verified
  - id: frontend.routing
    statement: Bootstrap configures HTTP interception, auth and appearance initialization; protected library/detail/list queue/settings/wishlist/appearance routes plus login and recovery.
    evidence: [{ path: web/src/main.ts, symbol: bootstrapApplication }]
    confidence: verified
  - id: frontend.identity
    statement: Public config initializes persisted Supabase sessions; relative API bearer requests retry once after shared token refresh; guards enforce enabled-auth access.
    evidence:
      [
        { path: web/src/auth/auth.service.ts, symbol: AuthService.init },
        { path: web/src/auth/auth.interceptor.ts, symbol: authInterceptor },
        { path: web/src/auth/auth.guard.ts, symbol: authGuard },
      ]
    confidence: verified
  - id: frontend.current-cache
    statement: DataCache replaced scoring-cache.ts during concurrent user work; per-user SWR reads use 60-second freshness, seven-day persisted entry age, shared in-flight requests and mutation invalidation. Settings bypass normal freshness while valid/nonstale.
    evidence:
      [
        { path: web/src/data-cache.ts, symbol: DataCache.swr },
        { path: web/src/scoring-settings.ts, symbol: ScoringSettingsStore.get },
      ]
    confidence: verified
  - id: frontend.editing
    statement: Library uses debounced server queries and 24-item pagination; detail preserves edited drafts during revalidation and patches changed fields with rating-specific autoFinish.
    evidence:
      [
        { path: web/src/library.ts, symbol: Library.load },
        { path: web/src/detail.ts, symbol: Detail.show },
        { path: web/src/detail.ts, symbol: Detail.save },
      ]
    confidence: verified
  - id: frontend.queue
    statement: Queue retains canonical positions during client search, disables drag while searching, supports pointer/touch/keyboard reorder, persists optimistic display cache and serializes accepted reorder requests before delayed forced reconciliation.
    evidence:
      [
        { path: web/src/queue.ts, symbol: Queue.shown },
        { path: web/src/queue.ts, symbol: Queue.drop },
        { path: web/src/queue.ts, symbol: Queue.save },
        { path: web/src/queue.ts, symbol: Queue.refreshQuietly },
      ]
    confidence: verified
  - id: frontend.acquisition
    statement: Wishlist supports Steam search/add/import, manual add and price refresh through API; acquisition invalidates game-dependent browser caches.
    evidence:
      [
        { path: web/src/wishlist.ts, symbol: Wishlist.importSteam },
        { path: web/src/wishlist-api.ts, symbol: WishlistApi.changed },
      ]
    confidence: verified
  - id: frontend.appearance
    statement: Appearance is browser-local per user with last-used preference fallback and built-in/custom logo controls.
    evidence:
      [
        { path: web/src/appearance.ts, symbol: AppearanceStore },
        { path: web/src/appearance.ts, symbol: readLogoFile },
        { path: web/src/logo.ts, symbol: Logo },
      ]
    confidence: verified
  - id: frontend.validation
    statement: npm test covers API tests only and Angular config has no test target; legacy README/design three-screen/no-auth claims conflict with current source.
    evidence:
      [
        { path: package.json, symbol: scripts.test },
        { path: angular.json },
        { path: docs/design.md },
        { path: web/src/main.ts },
      ]
    confidence: verified
inferences:
  - id: domains.frontend-boundaries
    statement: Identity, library, prioritization and wishlist are useful business context branches; components do not establish formal DDD aggregates.
    evidence: [{ path: shared/models.ts }, { path: web/src/main.ts }]
    validation_needed: Align domain classifications with backend investigation.
architecture_units:
  - {
      id: frontend.shell-auth,
      name: Shell and identity,
      responsibility: Bootstrap/session/appearance,
      source_paths: [web/src/main.ts, web/src/auth/auth.service.ts, web/src/appearance.ts],
      depends_on: [backend.public-config],
      domains: [domain.identity],
      suggested_doc: AI/Architecture/front-end/shell-and-authentication.md,
    }
  - {
      id: frontend.library-detail,
      name: Library and detail,
      responsibility: Browse/edit game state,
      source_paths: [web/src/library.ts, web/src/detail.ts, web/src/immediate.ts],
      depends_on: [backend.game-api],
      domains: [domain.game-library],
      suggested_doc: AI/Architecture/front-end/library-and-game-detail.md,
    }
  - {
      id: frontend.list-settings,
      name: Lists and settings,
      responsibility: List identity and scoring draft,
      source_paths: [web/src/lists.ts, web/src/settings.ts, web/src/scoring-settings.ts],
      depends_on: [backend.list-api],
      domains: [domain.prioritization],
      suggested_doc: AI/Architecture/front-end/lists-and-scoring-settings.md,
    }
  - {
      id: frontend.queue,
      name: Queue,
      responsibility: Search and optimistic manual order,
      source_paths: [web/src/queue.ts],
      depends_on: [frontend.list-settings, backend.queue-api],
      domains: [domain.prioritization],
      suggested_doc: AI/Architecture/front-end/queue-interactions.md,
    }
  - {
      id: frontend.wishlist,
      name: Wishlist,
      responsibility: Acquisition UI,
      source_paths: [web/src/wishlist.ts, web/src/wishlist-api.ts],
      depends_on: [backend.wishlist-api],
      domains: [domain.wishlist],
      suggested_doc: AI/Architecture/front-end/wishlist.md,
    }
cross_area_impacts:
  - {
      source_unit: frontend.shell-auth,
      target_area: security,
      relation: Session and bearer authorization contracts,
    }
  - {
      source_unit: frontend.library-detail,
      target_area: domain,
      relation: Rating/completion and desire affect recommendations,
    }
  - {
      source_unit: frontend.list-settings,
      target_area: cache,
      relation: Settings/queue version reconciliation,
    }
  - {
      source_unit: frontend.queue,
      target_area: backend,
      relation: Acceptance precedes durable background reorder,
    }
  - {
      source_unit: frontend.wishlist,
      target_area: integration,
      relation: Server-mediated Steam acquisition and prices,
    }
risks:
  - { severity: medium, description: No frontend tests cover complex auth/cache/drag interactions }
  - {
      severity: medium,
      description: Background reorder can finish after fixed delayed reconciliation,
    }
  - { severity: low, description: Previous-desire storage lacks user scope and logout clearing }
  - { severity: low, description: Legacy documentation describes superseded application behavior }
unknowns:
  - Live deployed provider configuration and browser behavior were not exercised.
  - Concurrent user application changes may continue after this source inspection.
suggested_documents:
  - { path: AI/Architecture/front-end-architecture.md, reason: Progressive map of SPA ownership }
  - {
      path: AI/Architecture/front-end/shell-and-authentication.md,
      reason: Critical session/bootstrap/appearance lifecycle,
    }
  - {
      path: AI/Architecture/front-end/library-and-game-detail.md,
      reason: Browsing and domain-affecting assessment flow,
    }
  - {
      path: AI/Architecture/front-end/lists-and-scoring-settings.md,
      reason: Reused list identity and scoring state,
    }
  - {
      path: AI/Architecture/front-end/queue-interactions.md,
      reason: Complex accessible optimistic drag mechanism,
    }
  - { path: AI/Architecture/front-end/wishlist.md, reason: Acquisition and external integration UI }
```

Source inspected on 2026-10-11. Discovery preserved all application and legacy documentation files. The original investigation observed scoring-cache.ts; this saved contract supersedes that observation with the inspected current DataCache implementation.
