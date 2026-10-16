---
name: security
description: Self-review checklist for the security role. Use it before you report a task done.
type: reference
area: jobs
---

# Security checklist

Apply this checklist to the changed scope. Mark unrelated items as not applicable.
Fix issues in scope. Record other gaps in `bd`.

## Before

- [ ] Did you name the assets and the users this change can affect?
- [ ] Did you list the inputs that come from outside the system?

## Access control

- [ ] Does each endpoint require authentication, unless it is public on purpose?
- [ ] Does each endpoint check that the caller may act on that exact record?
- [ ] Does RLS enforce the same rule in the database?
- [ ] Does the browser use only the publishable key?
- [ ] Is the service-role key present only on the server?
- [ ] Does a role change or a token refresh keep the rule correct?

## Input and output

- [ ] Does the server validate every input with a schema?
- [ ] Does the code use parameterized queries and no string-built SQL?
- [ ] Does the UI escape user content, with no raw HTML?
- [ ] Do file uploads check type, size and storage path?
- [ ] Does the code check redirect targets against an allow list?
- [ ] Do error messages avoid secrets and internal details?

## Secrets and dependencies

- [ ] Is each secret in an environment variable and not in git?
- [ ] Do approved configuration notes list variable names without secret values?
- [ ] Did you run `pnpm audit` and review each high or critical finding?
- [ ] Is each new dependency needed, maintained and pinned by the lockfile?

## Before you report done

- [ ] Do CORS and cookie settings (Secure, HttpOnly, SameSite) match the rule?
- [ ] Do login and other costly endpoints have a rate limit?
- [ ] Does a test prove that an unauthorized call fails?
- [ ] Do logs contain no token, password or personal data?
- [ ] Did you file a `bd` issue for each risk you accept?

## Related

- [[AI/jobs/index]]: Role checklists for task review.
- [[AI/index]]: Entry point: pick the area you change and follow one link.
