---
name: database
description: Self-review checklist for the database role. Use it before you report a task done.
type: reference
area: jobs
---

# Database checklist

Answer every item with yes, no or not applicable. Fix each no before you report done.

## Before

- [ ] Did you read the current schema and the latest migrations?
- [ ] Does a table or column already hold this data?
- [ ] Can the model remove a join or a repeated query?

## Table design

- [ ] Does the new table have a primary key?
- [ ] Does each foreign key exist, with a defined delete rule (cascade, restrict or set null)?
- [ ] Does each foreign key column have an index?
- [ ] Does the table have `created_at` and `updated_at`, with a trigger for `updated_at`?
- [ ] Does the table have `created_by` where users create rows?
- [ ] Does the table use `deleted_at` where you need soft delete, and do queries filter it?
- [ ] Do columns use the right type: `timestamptz`, `numeric` for money, `uuid` for ids?
- [ ] Does each column have `NOT NULL`, a default, a `CHECK` or an enum where the rule is known?
- [ ] Does the table avoid duplicate data?
- [ ] Is each unavoidable duplicate justified in the migration comment?
- [ ] Do unique constraints protect each natural key?

## Security and access

- [ ] Is row level security (RLS) enabled on the table?
- [ ] Does each RLS policy name the role and the operation?
- [ ] Did you run the Supabase advisors and fix each warning?

## Before you report done

- [ ] Does the migration run on a clean database?
- [ ] Is the migration reversible, or does it state why it is not?
- [ ] Does the migration avoid long locks on a large table?
- [ ] Did you check the query plan with `EXPLAIN (ANALYZE)` for each new hot query?
- [ ] Does each list query paginate, with a stable order and an index that supports it?
- [ ] Did you regenerate the TypeScript types after the change?
- [ ] Did `pnpm check` pass?

## Related

- [[AI/jobs/index]]: Table of role checklists. Pick the roles of your task and run each checklist before you report done.
