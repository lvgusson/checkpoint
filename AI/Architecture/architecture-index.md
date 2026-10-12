# Architecture index

Checkpoint is a single npm package with an Angular SPA, native Node HTTP API, shared TypeScript DTOs, optional PostgreSQL/Supabase or local JSON persistence, Steam integration, and Vercel deployment configuration. Current implementation is the authority; hosted state has not been queried.

| Area                  | Root                                                          | Canonical responsibility                                   |
| --------------------- | ------------------------------------------------------------- | ---------------------------------------------------------- |
| Frontend              | [Frontend architecture](front-end-architecture.md)            | Routing, screens, browser state, interaction flows         |
| Backend               | [Backend architecture](back-end-architecture.md)              | HTTP, application services, adapters, background execution |
| Database              | [Database architecture](database-architecture.md)             | Storage ownership, SQL schema, migration variants          |
| Infrastructure        | [Infrastructure architecture](infrastructure-architecture.md) | Build, deployment, release operations, rollback            |
| Security              | [Security architecture](security-architecture.md)             | Identity, owner filtering, Data API grants/RLS             |
| Cache                 | [Cache architecture](cache-architecture.md)                   | Browser cache, Steam cache, invalidation and consistency   |
| Agent harness         | [Harness architecture](harness-architecture.md)               | Documentation policy, validation, Git review gate, CI      |
| Business capabilities | [Domain index](domains/domains-index.md)                      | Library, prioritization, wishlist, identity boundaries     |

Use [ownership routing](../validation/ownership.json) to identify multiple impacted owners. Read the relevant roots, then useful leaves and related domains. [Main entry](../main-entry.md) defines the mandatory development workflow. [Contract](../architecture-contract.md) defines schema and historical integrity.

Existing `README.md`, `docs/design.md`, `docs/implementation-plan.md`, `docs/deploy.md`, and `db/README.md` contain historical claims that may lag current implementation. Their discrepancies are recorded in area leaves; the canonical current maps are here.
