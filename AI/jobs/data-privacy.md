---
name: data-privacy
description: Self-review checklist for the data privacy (LGPD) role. Use it before you report a task done.
type: reference
area: jobs
---

# Data privacy (LGPD) checklist

Answer every item with yes, no or not applicable. Fix each no before you report done.

## Before

- [ ] Does the change collect, store, share or delete personal data?
- [ ] Did you list each personal data field and its purpose?
- [ ] Does each field have a legal basis (LGPD article 7), for example consent or contract?
- [ ] Do you need each field, or can you collect less?

## Data handling

- [ ] Do you mark sensitive data (health, biometrics, race, religion, political views) and treat it with extra care?
- [ ] Does the system collect consent in clear language, with a recorded date and version?
- [ ] Can the user withdraw consent as easily as they gave it?
- [ ] Does each field have a retention period and a deletion job?
- [ ] Does the system encrypt personal data in transit and at rest?
- [ ] Does RLS limit each row of personal data to the owner and to allowed roles?
- [ ] Do logs, analytics and error reports exclude personal data?
- [ ] Do test data and seed data contain no real personal data?
- [ ] Does each share with a third party have a contract and a recorded purpose?
- [ ] Do data transfers outside Brazil have a legal basis?

## Data subject rights

- [ ] Can the user see their data (access)?
- [ ] Can the user correct their data?
- [ ] Can the user export their data in a common format (portability)?
- [ ] Can the user delete their account and data, or anonymize it?
- [ ] Does deletion also reach backups, caches and third parties, or does the note state the delay?

## Before you report done

- [ ] Does an audit trail record who accessed or changed personal data?
- [ ] Did you update the privacy notice if the use of data changed?
- [ ] Did you file a `bd` issue for each gap, and tell the owner about each risk?

## Related

- [[AI/jobs/index]]: Table of role checklists. Pick the roles of your task and run each checklist before you report done.
