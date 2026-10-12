---
id: architecture.infrastructure
title: Infrastructure architecture
type: architecture-root
area: infrastructure
status: active
owner: unknown
last_verified: 2026-10-11
source_paths:
  - scripts/release-note.mjs
  - scripts/master-user.mjs
  - vercel.json
  - api/index.mjs
  - package.json
  - supabase/config.toml
  - scripts/record-release.mjs
  - scripts/rollback.mjs
related_domains: []
tags: [vercel, operations]
---

# Infrastructure architecture

## 1. Purpose

Map repository-supported deployment and operational boundaries.

## 2. Scope and ownership

Owns runtime packaging, configuration sources and release operations. Hosted service state is not established by these files.

## 3. Architecture map

| Responsibility                          | Source                                               | Detail                                                                     |
| --------------------------------------- | ---------------------------------------------------- | -------------------------------------------------------------------------- |
| Angular static output and Node function | `vercel.json`, `api/index.mjs`                       | [Deployment and release](infrastructure/deployment-and-release.md)         |
| Database/Auth configuration             | `supabase/config.toml`                               | [Database](database-architecture.md), [security](security-architecture.md) |
| Release catalogue and rollback          | `scripts/record-release.mjs`, `scripts/rollback.mjs` | [Deployment and release](infrastructure/deployment-and-release.md)         |

## 4. Contracts and behavior

VERIFIED: Vercel config declares pdx1, one Node API entry and Angular static output. package.json requires Node >=24.15.0. npm scripts provide local start/dev/check, Vercel build/release recording, explicit release registration, master account provisioning, and architecture validation/review gates.

## 5. Invariants

Application rollback leaves migrations intact. Serverless JSON fallback uses temporary per-instance state. Production auth missing required configuration fails closed on protected routes.

## 6. Dependencies

Vercel serves static assets and the Node function. The API may depend on PostgreSQL/Supabase Auth and external Steam services. Local checks depend on TypeScript, ESLint, Prettier, Node tests and Angular build.

## 7. Data and state

No repository evidence establishes hosted backups, scaling limits or alerting. [Deployment and release](infrastructure/deployment-and-release.md) documents process state, database pool lifecycle and best-effort release recording.

## 8. Source references

`vercel.json`; `api/index.mjs#handler`; `package.json#scripts`; `supabase/config.toml`; `scripts/record-release.mjs#main`; `scripts/rollback.mjs#rollback`.

## 9. Related documentation

[Architecture index](architecture-index.md), [database root](database-architecture.md), [security root](security-architecture.md).

## 10. Evidence and uncertainties

VERIFIED local configuration. INFERRED intended hosted topology follows Vercel/Supabase documentation in the repository. UNKNOWN: deployment connections, currently served release, hosted settings, backups and remote CI/branch protection. Existing Husky hooks were lint-staged and commitlint during initial discovery; this bootstrap adds enforcement documented by the coordinator.
