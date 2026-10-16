---
name: infra
description: Self-review checklist for the infra role. Use it before you report a task done.
type: reference
area: jobs
---

# Infrastructure checklist

Answer every item with yes, no or not applicable. Fix each no before you report done.

## Before

- [ ] Did you write the need in one sentence: load, data size, availability goal?
- [ ] Can a service that we already use (Vercel, Supabase) meet the need?
- [ ] Did you estimate the monthly cost?

## Design

- [ ] Does each service have one owner and one purpose?
- [ ] Do the regions of the web host, the API and the database match?
- [ ] Does the database connection use pooling?
- [ ] Do serverless functions have a memory size and a timeout that fit the work?
- [ ] Do long jobs run in a queue or a workflow, not in a request?
- [ ] Do static assets use the CDN with a cache rule?
- [ ] Do file uploads use object storage and not the database?

## Reliability

- [ ] Does the database have automatic backups?
- [ ] Did you test a restore from backup?
- [ ] Does each external service have a failure plan: retry, fallback or clear error?
- [ ] Does each environment (local, preview, homologacao, production) have its own data and keys?
- [ ] Does production data stay out of non-production environments?

## Before you report done

- [ ] Did you set a budget alert or usage limit for each paid service?
- [ ] Do you have a way to create the setup again from the docs or the code?
- [ ] Does each domain and certificate have an owner and a renewal check?
- [ ] Did you file a `bd` issue for each known limit or single point of failure?
- [ ] Did you update the note in `AI/` that describes the setup?

## Related

- [[AI/jobs/index]]: Table of role checklists. Pick the roles of your task and run each checklist before you report done.
