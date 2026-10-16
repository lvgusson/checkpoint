---
name: observability
description: Self-review checklist for the observability role. Use it before you report a task done.
type: reference
area: jobs
---

# Observability checklist

Answer every item with yes, no or not applicable. Fix each no before you report done.

## Before

- [ ] Can you state the question that an operator must answer with this data?
- [ ] Do you know the failure modes of this change?

## Logs

- [ ] Do logs use one structured format, with level and timestamp?
- [ ] Does each request log carry a request id?
- [ ] Does the request id pass from the web app to the API?
- [ ] Do logs contain no password, token or personal data?
- [ ] Does each log level match the event: error for failures, info for normal events?
- [ ] Does each caught error get logged once, with context?

## Errors and metrics

- [ ] Does an error tracker receive unhandled errors of the web app and the API?
- [ ] Does the error report carry release, environment and user id (not email)?
- [ ] Do you track the rate, errors and duration of each critical endpoint?
- [ ] Do you track business events that show if the feature works?
- [ ] Do metric names and labels stay low in cardinality?

## Health and alerts

- [ ] Does a health endpoint check the dependencies that matter?
- [ ] Does each alert tell a person what to do?
- [ ] Do alerts use symptoms, such as error rate, and not every cause?
- [ ] Do you know where to read the logs of each environment?

## Before you report done

- [ ] Did you trigger a failure on purpose and see it in the logs?
- [ ] Did the Vercel and Supabase log tools show the new events?
- [ ] Did you remove noisy or duplicate logs?
- [ ] Did you note new log fields or metrics in `AI/`?

## Related

- [[AI/jobs/index]]: Table of role checklists. Pick the roles of your task and run each checklist before you report done.
