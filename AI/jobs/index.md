---
name: index
description: Table of role checklists. Pick the roles of your task and run each checklist before you report done.
type: hub
area: jobs
---

# Role checklists

Each file supports review of the changed scope. These checklists do not describe implemented features.
Use [[AGENTS]]: the shared workflow and required checks.

1. Pick the roles from the table.
2. Open each file and answer every item.
3. Fix issues in scope. Record other gaps in `bd`. Report checks and limitations.

| Role                | File                       | When to use                                                   |
| ------------------- | -------------------------- | ------------------------------------------------------------- |
| Frontend            | [[AI/jobs/frontend]]       | You change React or Vite code in `apps/web`                   |
| Backend             | [[AI/jobs/backend]]        | You change routes, use cases or services in `apps/api`        |
| Database            | [[AI/jobs/database]]       | You change tables, migrations, RLS or queries                 |
| Security            | [[AI/jobs/security]]       | You touch auth, input, secrets, uploads or dependencies       |
| DevOps              | [[AI/jobs/devops]]         | You change CI, deploy, scripts or environment variables       |
| Infrastructure      | [[AI/jobs/infra]]          | You add or change a hosted service, region, storage or limit  |
| Design and UX       | [[AI/jobs/design-ux]]      | You change what the user sees or does                         |
| QA and testing      | [[AI/jobs/qa-testing]]     | You write or change tests, or fix a bug                       |
| Performance         | [[AI/jobs/performance]]    | You add a hot path, a list, a large asset or a heavy query    |
| Observability       | [[AI/jobs/observability]]  | You add logs, metrics, errors, alerts or health checks        |
| Data privacy (LGPD) | [[AI/jobs/data-privacy]]   | You handle personal data                                      |
| API contract        | [[AI/jobs/api-contract]]   | You change a type or schema in `packages/core` or an endpoint |
| Docs and knowledge  | [[AI/jobs/docs-knowledge]] | You write or edit a note in `AI/`                             |
| Code review         | [[AI/jobs/code-review]]    | You review a change, yours or from another agent              |

## Related

- [[AI/index]]: Entry point for repository knowledge.
