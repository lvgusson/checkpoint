# Data, security and infrastructure investigation

Repository-only inspection completed on 2026-10-11. No live database access or production changes.

```json
{
  "agent_id": "data-security-infra-discovery",
  "scope": "D data, E infrastructure, F security",
  "status": "complete",
  "inspected_paths": [
    "AI/main-entry.md",
    "plan1.md",
    "AI/architecture-contract.md",
    "AI/documentation-template.md",
    ".agents/skills/supabase/SKILL.md",
    "api/src/auth.ts",
    "api/src/app-user.ts",
    "api/src/context.ts",
    "api/src/db.ts",
    "api/src/setup.ts",
    "api/src/server.ts",
    "api/src/pg-repository.ts",
    "api/src/wishlist-repository.ts",
    "api/src/version.ts",
    "api/index.mjs",
    "web/src/auth/auth.service.ts",
    "web/src/auth/auth.interceptor.ts",
    "web/src/auth/auth.guard.ts",
    "db/migrations",
    "supabase/migrations",
    "supabase/config.toml",
    "scripts/release-lib.mjs",
    "scripts/record-release.mjs",
    "scripts/rollback.mjs",
    "package.json",
    "vercel.json",
    ".gitignore",
    ".vercelignore",
    ".husky/pre-commit",
    ".husky/commit-msg",
    "db/README.md",
    "supabase/README.md",
    "docs/deploy.md"
  ],
  "verified_findings": [
    {
      "id": "data.selection",
      "statement": "DATABASE_URL chooses PostgreSQL; otherwise shared local JSON variants. Vercel defaults to temporary instance storage.",
      "evidence": [
        {
          "path": "api/src/setup.ts",
          "symbol": "createService"
        }
      ],
      "confidence": "verified"
    },
    {
      "id": "data.ownership",
      "statement": "Global catalogue is separate from personal library; lists partition settings/pins, not library membership. Composite user/list foreign keys enforce ownership.",
      "evidence": [
        {
          "path": "db/migrations/011_game_lists.sql",
          "symbol": "user_score_weights_list_fk"
        }
      ],
      "confidence": "verified"
    },
    {
      "id": "data.current-schema",
      "statement": "008 removes snapshots and invalidation; 009 converts manual points to pins and adds immediate desire; 010 adds label; 013/014 add wishlist and latest prices.",
      "evidence": [
        {
          "path": "db/migrations/009_queue_pins_desire_immediate.sql",
          "symbol": "manual_position"
        }
      ],
      "confidence": "verified"
    },
    {
      "id": "data.current-writes",
      "statement": "Current pin uses atomic writable CTE with client request deduplication, not the historical apply_queue_move RPC.",
      "evidence": [
        {
          "path": "api/src/pg-repository.ts",
          "symbol": "PgManualAdjustmentRepository.pin"
        }
      ],
      "confidence": "verified"
    },
    {
      "id": "data.mirror",
      "statement": "First 001-003 timestamped copies differ only by transaction wrapper removals/comments. Remaining mirrored files 004 and 006-014 have identical hashes. Supabase-only hardening is separate.",
      "evidence": [
        {
          "path": "supabase/migrations/20261011154854_supabase_hardening.sql"
        }
      ],
      "confidence": "verified"
    },
    {
      "id": "security.jwt",
      "statement": "JWT verification validates issuer/audience/algorithms; HS256 uses remote Auth fallback. Missing production configuration fails closed.",
      "evidence": [
        {
          "path": "api/src/auth.ts",
          "symbol": "authenticatorFromEnv"
        }
      ],
      "confidence": "verified"
    },
    {
      "id": "security.mapping",
      "statement": "Request identity maps to app_user with conditional seed claim and per-instance promise cache. SQL personal operations apply resolved owner predicates.",
      "evidence": [
        {
          "path": "api/src/app-user.ts",
          "symbol": "createAppUserResolver"
        }
      ],
      "confidence": "verified"
    },
    {
      "id": "security.rls",
      "statement": "Data API uses catalogue read and personal owner RLS, explicit grants and hardening. Direct SQL does not set authenticated JWT SQL context.",
      "evidence": [
        {
          "path": "db/migrations/003_rls.sql",
          "symbol": "current_app_user_id"
        }
      ],
      "confidence": "verified"
    },
    {
      "id": "security.browser",
      "statement": "Browser sessions persist/refresh; interceptor restricts token destinations and retries once after refresh. Current sign-out clears data cache.",
      "evidence": [
        {
          "path": "web/src/auth/auth.service.ts",
          "symbol": "AuthService"
        }
      ],
      "confidence": "verified"
    },
    {
      "id": "infra.topology",
      "statement": "Vercel config specifies static Angular output and one Node API entry in pdx1.",
      "evidence": [
        {
          "path": "vercel.json"
        }
      ],
      "confidence": "verified"
    },
    {
      "id": "infra.release",
      "statement": "Release records are best-effort at build time; rollback dry-runs by default and never reverses database migrations automatically.",
      "evidence": [
        {
          "path": "scripts/release-lib.mjs",
          "symbol": "migrationWarning"
        }
      ],
      "confidence": "verified"
    },
    {
      "id": "infra.initial-hooks",
      "statement": "Initial Husky hooks ran lint-staged and commitlint; no .github/workflows directory was present at discovery.",
      "evidence": [
        {
          "path": ".husky/pre-commit"
        }
      ],
      "confidence": "verified"
    }
  ],
  "inferences": [
    {
      "id": "infra.intended-hosted-database",
      "statement": "Intended hosted topology uses Supabase PostgreSQL 17 with transaction pooling.",
      "evidence": [
        {
          "path": "supabase/config.toml"
        },
        {
          "path": "supabase/README.md"
        }
      ],
      "validation_needed": "Actual hosted version, connection role/endpoint and applied migrations were not checked."
    }
  ],
  "architecture_units": [
    {
      "id": "architecture.database.persistence",
      "name": "Persistence",
      "responsibility": "Storage ownership and current statements",
      "source_paths": [
        "api/src/setup.ts",
        "api/src/db.ts",
        "api/src/pg-repository.ts",
        "api/src/wishlist-repository.ts"
      ],
      "depends_on": ["architecture.security.identity"],
      "domains": ["domain.game-library", "domain.prioritization", "domain.wishlist"],
      "suggested_doc": "AI/Architecture/database/persistence.md"
    },
    {
      "id": "architecture.database.migrations",
      "name": "Schema evolution",
      "responsibility": "Portable/Supabase migrations and compatibility",
      "source_paths": [
        "db/migrations",
        "supabase/migrations",
        "supabase/config.toml",
        "db/seed/import.mjs"
      ],
      "depends_on": ["architecture.database.persistence"],
      "domains": ["domain.game-library", "domain.prioritization", "domain.wishlist"],
      "suggested_doc": "AI/Architecture/database/migrations.md"
    },
    {
      "id": "architecture.security.identity",
      "name": "Identity and ownership",
      "responsibility": "JWT, browser sessions and request/app-user mapping",
      "source_paths": [
        "api/src/auth.ts",
        "api/src/app-user.ts",
        "api/src/context.ts",
        "web/src/auth"
      ],
      "depends_on": ["architecture.database.persistence"],
      "domains": ["domain.identity"],
      "suggested_doc": "AI/Architecture/security/authentication-and-ownership.md"
    },
    {
      "id": "architecture.security.database-access",
      "name": "Database access",
      "responsibility": "RLS/grants and direct SQL trust boundary",
      "source_paths": [
        "db/migrations/003_rls.sql",
        "supabase/migrations/20261011154854_supabase_hardening.sql",
        "api/src/pg-repository.ts"
      ],
      "depends_on": ["architecture.security.identity"],
      "domains": ["domain.identity", "domain.game-library"],
      "suggested_doc": "AI/Architecture/security/database-access.md"
    },
    {
      "id": "architecture.infrastructure.delivery",
      "name": "Deployment and release",
      "responsibility": "Packaging, build-time records and rollback",
      "source_paths": [
        "vercel.json",
        "api/index.mjs",
        "scripts/record-release.mjs",
        "scripts/release-lib.mjs",
        "scripts/rollback.mjs",
        "api/src/version.ts"
      ],
      "depends_on": ["architecture.database.migrations", "architecture.security.identity"],
      "domains": [],
      "suggested_doc": "AI/Architecture/infrastructure/deployment-and-release.md"
    }
  ],
  "cross_area_impacts": [
    {
      "source_unit": "architecture.security.identity",
      "target_area": "database",
      "relation": "Resolved app-user controls repository owner predicates and initial seed claim."
    },
    {
      "source_unit": "architecture.database.persistence",
      "target_area": "domain",
      "relation": "Global catalogue edits propagate across users; lists partition settings/pins."
    },
    {
      "source_unit": "architecture.infrastructure.delivery",
      "target_area": "database",
      "relation": "Rollback can run old code against current migrated schema."
    }
  ],
  "risks": [
    {
      "severity": "high",
      "description": "Authenticated library owners can edit shared catalogue fields; no curator check found."
    },
    {
      "severity": "medium",
      "description": "Auth-enabled JSON fallback selects shared repositories without PostgreSQL user partition."
    },
    {
      "severity": "medium",
      "description": "library_entry.version exists but HTTP PATCH implements no If-Match/ETag enforcement."
    },
    {
      "severity": "medium",
      "description": "db/README.md has removed snapshots/old keys/enums; docs/deploy.md has obsolete apply_queue_move reorder description."
    },
    {
      "severity": "medium",
      "description": "Build-time best-effort release records cannot prove traffic promotion."
    }
  ],
  "unknowns": [
    "Hosted migrations, role/BYPASSRLS, Auth settings, Data API exposure, deployment state, backups, monitoring and remote enforcement.",
    "No live database queries/advisors or migration execution performed.",
    "No production files edited."
  ],
  "suggested_documents": [
    {
      "path": "AI/Architecture/database-architecture.md",
      "reason": "Canonical scoped evidence and navigation for assigned ownership."
    },
    {
      "path": "AI/Architecture/database/persistence.md",
      "reason": "Canonical scoped evidence and navigation for assigned ownership."
    },
    {
      "path": "AI/Architecture/database/migrations.md",
      "reason": "Canonical scoped evidence and navigation for assigned ownership."
    },
    {
      "path": "AI/Architecture/security-architecture.md",
      "reason": "Canonical scoped evidence and navigation for assigned ownership."
    },
    {
      "path": "AI/Architecture/security/authentication-and-ownership.md",
      "reason": "Canonical scoped evidence and navigation for assigned ownership."
    },
    {
      "path": "AI/Architecture/security/database-access.md",
      "reason": "Canonical scoped evidence and navigation for assigned ownership."
    },
    {
      "path": "AI/Architecture/infrastructure-architecture.md",
      "reason": "Canonical scoped evidence and navigation for assigned ownership."
    },
    {
      "path": "AI/Architecture/infrastructure/deployment-and-release.md",
      "reason": "Canonical scoped evidence and navigation for assigned ownership."
    }
  ]
}
```
