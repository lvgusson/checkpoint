# Backend, domain and cache investigation

Verified on 2026-10-12. Read-only discovery followed by explicitly authorized documentation authoring; no production files changed.

```json
{
  "agent_id": "backend-domain-cache-discovery",
  "scope": "Backend, domain capabilities, cache and background work (plan roles C, G, H)",
  "status": "complete",
  "inspected_paths": [
    "api/index.mjs",
    "api/src/server.ts",
    "api/src/setup.ts",
    "api/src/service.ts",
    "api/src/wishlist.ts",
    "api/src/wishlist-routes.ts",
    "api/src/context.ts",
    "shared/models.ts",
    "api/src/repository.ts",
    "api/test/service.test.ts",
    "api/test/lists.test.ts",
    "api/src/pg-repository.ts",
    "api/src/list-repository.ts",
    "api/src/manual-repository.ts",
    "api/src/settings-repository.ts",
    "api/src/wishlist-repository.ts",
    "api/src/background.ts",
    "api/src/retry.ts",
    "api/test/manual.test.ts",
    "api/src/steam.ts",
    "api/src/steam-mapping.ts",
    "api/test/steam.test.ts",
    "web/src/data-cache.ts",
    "web/src/scoring-settings.ts",
    "api/src/app-user.ts",
    "api/src/scoring.ts",
    "api/src/auth.ts",
    "api/src/version.ts",
    "db/migrations/008_drop_queue_snapshot.sql",
    "web/src/api.ts",
    "web/src/wishlist-api.ts",
    "web/src/lists.ts",
    "web/src/auth/auth.service.ts",
    "api/src/scoring-config.ts",
    "api/test/settings.test.ts",
    "api/test/scoring.test.ts"
  ],
  "verified_findings": [
    {
      "id": "http-composition",
      "statement": "node:http routing is reused by standalone and Vercel entrypoints; constructor injection selects Pg or JSON adapters.",
      "evidence": [
        {
          "path": "api/src/server.ts",
          "symbol": "makeServer"
        },
        {
          "path": "api/src/setup.ts",
          "symbol": "createService"
        }
      ],
      "confidence": "verified"
    },
    {
      "id": "library-and-lists",
      "statement": "Lists share the full owner library; config, pins and history are list-specific.",
      "evidence": [
        {
          "path": "api/src/service.ts",
          "symbol": "inputs"
        },
        {
          "path": "shared/models.ts",
          "symbol": "GameList"
        }
      ],
      "confidence": "verified"
    },
    {
      "id": "scoring",
      "statement": "Learned duration/affinity, greedy contextual queue, urgency, prerequisite exceptions and post-algorithm pin merge are implemented.",
      "evidence": [
        {
          "path": "api/src/scoring.ts",
          "symbol": "recommendGames"
        }
      ],
      "confidence": "verified"
    },
    {
      "id": "lifecycle",
      "statement": "Changed non-null rating auto-completes unless disabled; completion removes pins across lists after saving.",
      "evidence": [
        {
          "path": "api/src/service.ts",
          "symbol": "patch"
        }
      ],
      "confidence": "verified"
    },
    {
      "id": "background",
      "statement": "Reorder acknowledgment precedes persistence; per-process serialization and UUID deduplication apply; retries end in log-only failure.",
      "evidence": [
        {
          "path": "api/src/service.ts",
          "symbol": "persistMove"
        },
        {
          "path": "api/src/pg-repository.ts",
          "symbol": "PgManualAdjustmentRepository.pin"
        }
      ],
      "confidence": "verified"
    },
    {
      "id": "cache",
      "statement": "Current browser DataCache SWR is user scoped with 60-second freshness; wishlist price TTL 6h, Steam tags 24h.",
      "evidence": [
        {
          "path": "web/src/data-cache.ts",
          "symbol": "DataCache"
        },
        {
          "path": "api/src/wishlist.ts",
          "symbol": "list"
        },
        {
          "path": "api/src/steam.ts",
          "symbol": "tagNames"
        }
      ],
      "confidence": "verified"
    },
    {
      "id": "snapshot-removed",
      "statement": "Migration 008 removes materialized recommendation snapshot; current API calculates from inputs.",
      "evidence": [
        {
          "path": "db/migrations/008_drop_queue_snapshot.sql"
        },
        {
          "path": "api/src/service.ts",
          "symbol": "recommendations"
        }
      ],
      "confidence": "verified"
    }
  ],
  "inferences": [
    {
      "id": "capability-boundaries",
      "statement": "Game library, prioritization, wishlist and identity are documentation capability boundaries; independent DDD contexts/aggregates are not established.",
      "evidence": [
        {
          "path": "shared/models.ts"
        },
        {
          "path": "api/src/service.ts"
        }
      ],
      "validation_needed": "Business-owner confirmation."
    }
  ],
  "architecture_units": [
    {
      "id": "architecture.backend",
      "name": "Backend architecture",
      "responsibility": "Map the HTTP API, application orchestration, repositories and Steam integration.",
      "source_paths": [],
      "depends_on": [],
      "domains": [],
      "suggested_doc": "AI/Architecture/back-end-architecture.md"
    },
    {
      "id": "architecture.backend.http",
      "name": "HTTP API contracts",
      "responsibility": "Describe transport routing, validation and response contracts.",
      "source_paths": [],
      "depends_on": [],
      "domains": [],
      "suggested_doc": "AI/Architecture/back-end/http-api.md"
    },
    {
      "id": "architecture.backend.service",
      "name": "Game and list orchestration",
      "responsibility": "Explain service orchestration across library, list configuration and queue state.",
      "source_paths": [],
      "depends_on": [],
      "domains": [],
      "suggested_doc": "AI/Architecture/back-end/game-service.md"
    },
    {
      "id": "architecture.backend.adapters",
      "name": "Repository ports and adapters",
      "responsibility": "Map service repository interfaces to JSON and PostgreSQL implementations.",
      "source_paths": [],
      "depends_on": [],
      "domains": [],
      "suggested_doc": "AI/Architecture/back-end/persistence-adapters.md"
    },
    {
      "id": "architecture.backend.reordering",
      "name": "Background reorder persistence",
      "responsibility": "Describe the acceptance, ordering and persistence guarantees of a manual queue move.",
      "source_paths": [],
      "depends_on": [],
      "domains": [],
      "suggested_doc": "AI/Architecture/back-end/background-reordering.md"
    },
    {
      "id": "architecture.backend.wishlist",
      "name": "Wishlist and Steam integration",
      "responsibility": "Explain acquisition integration and Steam request orchestration.",
      "source_paths": [],
      "depends_on": [],
      "domains": [],
      "suggested_doc": "AI/Architecture/back-end/wishlist-steam.md"
    },
    {
      "id": "architecture.cache",
      "name": "Cache architecture",
      "responsibility": "Map actual cache responsibilities and their independent consistency mechanisms.",
      "source_paths": [],
      "depends_on": [],
      "domains": [],
      "suggested_doc": "AI/Architecture/cache-architecture.md"
    },
    {
      "id": "architecture.cache.browser",
      "name": "Browser data cache",
      "responsibility": "Document cache keys, revalidation and mutation dependencies.",
      "source_paths": [],
      "depends_on": [],
      "domains": [],
      "suggested_doc": "AI/Architecture/cache/browser-data-cache.md"
    },
    {
      "id": "architecture.cache.steam",
      "name": "Steam price and tag caches",
      "responsibility": "Describe independent price and tag-vocabulary freshness mechanisms.",
      "source_paths": [],
      "depends_on": [],
      "domains": [],
      "suggested_doc": "AI/Architecture/cache/steam-caches.md"
    }
  ],
  "cross_area_impacts": [
    {
      "source_unit": "architecture.backend.service",
      "target_area": "domain/database/frontend/cache",
      "relation": "Library edits affect learned queue and all lists; global catalog metadata may affect other owners."
    },
    {
      "source_unit": "architecture.backend.reordering",
      "target_area": "infrastructure/frontend",
      "relation": "Deferred acceptance needs optimistic reconciliation and does not guarantee durability."
    }
  ],
  "risks": [
    {
      "severity": "medium",
      "description": "No distributed ordering or durable retry queue for acknowledged moves."
    },
    {
      "severity": "medium",
      "description": "Separate completion cleanup and Pg wishlist enrichment can partially succeed."
    },
    {
      "severity": "medium",
      "description": "Browser in-flight reads have no invalidation generation fence; settings options may stay stale after library edits."
    }
  ],
  "unknowns": [
    "Tests inspected, not executed during discovery.",
    "Hosted schema and live network integration not queried.",
    "Frontend changed concurrently from scoring-cache to DataCache; current source used."
  ],
  "suggested_documents": [
    {
      "path": "AI/Architecture/back-end-architecture.md",
      "reason": "Canonical cohesive responsibility backed by implementation evidence."
    },
    {
      "path": "AI/Architecture/back-end/http-api.md",
      "reason": "Canonical cohesive responsibility backed by implementation evidence."
    },
    {
      "path": "AI/Architecture/back-end/game-service.md",
      "reason": "Canonical cohesive responsibility backed by implementation evidence."
    },
    {
      "path": "AI/Architecture/back-end/persistence-adapters.md",
      "reason": "Canonical cohesive responsibility backed by implementation evidence."
    },
    {
      "path": "AI/Architecture/back-end/background-reordering.md",
      "reason": "Canonical cohesive responsibility backed by implementation evidence."
    },
    {
      "path": "AI/Architecture/back-end/wishlist-steam.md",
      "reason": "Canonical cohesive responsibility backed by implementation evidence."
    },
    {
      "path": "AI/Architecture/cache-architecture.md",
      "reason": "Canonical cohesive responsibility backed by implementation evidence."
    },
    {
      "path": "AI/Architecture/cache/browser-data-cache.md",
      "reason": "Canonical cohesive responsibility backed by implementation evidence."
    },
    {
      "path": "AI/Architecture/cache/steam-caches.md",
      "reason": "Canonical cohesive responsibility backed by implementation evidence."
    },
    {
      "path": "AI/Architecture/domains/game-library/domain.md",
      "reason": "Canonical cohesive responsibility backed by implementation evidence."
    },
    {
      "path": "AI/Architecture/domains/prioritization/domain.md",
      "reason": "Canonical cohesive responsibility backed by implementation evidence."
    },
    {
      "path": "AI/Architecture/domains/wishlist/domain.md",
      "reason": "Canonical cohesive responsibility backed by implementation evidence."
    },
    {
      "path": "AI/Architecture/domains/identity/domain.md",
      "reason": "Canonical cohesive responsibility backed by implementation evidence."
    },
    {
      "path": "AI/Architecture/domains/prioritization/scoring-and-pins.md",
      "reason": "Canonical cohesive responsibility backed by implementation evidence."
    }
  ]
}
```
