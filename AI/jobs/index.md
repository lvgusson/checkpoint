---
name: index
description: Table of role checklists. Pick the roles of your task and run each checklist before you report done.
type: hub
area: jobs
---

# Role checklists

Each file is a self-review gate. Agents run the checklist of each role that the task touches. Most tasks touch more than one role.

1. Pick the roles from the table.
2. Open each file and answer every item.
3. Fix each no, then report done.

| Role                | File                | When to use                                                   |
| ------------------- | ------------------- | ------------------------------------------------------------- |
| Frontend            | `frontend.md`       | You change React or Vite code in `apps/web`                   |
| Backend             | `backend.md`        | You change routes, use cases or services in `apps/api`        |
| Database            | `database.md`       | You change tables, migrations, RLS or queries                 |
| Security            | `security.md`       | You touch auth, input, secrets, uploads or dependencies       |
| DevOps              | `devops.md`         | You change CI, deploy, scripts or environment variables       |
| Infrastructure      | `infra.md`          | You add or change a hosted service, region, storage or limit  |
| Design and UX       | `design-ux.md`      | You change what the user sees or does                         |
| QA and testing      | `qa-testing.md`     | You write or change tests, or fix a bug                       |
| Performance         | `performance.md`    | You add a hot path, a list, a large asset or a heavy query    |
| Observability       | `observability.md`  | You add logs, metrics, errors, alerts or health checks        |
| Data privacy (LGPD) | `data-privacy.md`   | You handle personal data                                      |
| API contract        | `api-contract.md`   | You change a type or schema in `packages/core` or an endpoint |
| Docs and knowledge  | `docs-knowledge.md` | You write or edit a note in `AI/`                             |
| Code review         | `code-review.md`    | You review a change, yours or from another agent              |

## Related

- [[AI/index]]: Entry point: pick the area you will change and follow one link.
- [[AI/documentation-rules]]: When to edit or create an AI note, note types, frontmatter and linking rules.
