---
name: qa-testing
description: Self-review checklist for the QA and testing role. Use it before you report a task done.
type: reference
area: jobs
---

# QA and testing checklist

Answer every item with yes, no or not applicable. Fix each no before you report done.

## Before

- [ ] Can you write the expected behavior as a list of examples?
- [ ] Did you list the edge cases: empty, maximum, invalid, duplicate, concurrent?
- [ ] Did you choose the lowest test level that proves the behavior?

## Unit and integration tests (Vitest)

- [ ] Did you write the test before the code for new behavior?
- [ ] Does each test fail when the behavior breaks?
- [ ] Does each test check behavior and not internal calls?
- [ ] Does each test have a name that states the rule?
- [ ] Do tests stay independent, with no shared state and no fixed order?
- [ ] Do tests avoid real time, random values and the network?
- [ ] Do you mock only the system boundary?
- [ ] Do database tests run against the throwaway Postgres?
- [ ] Do database tests clean their data?

## End-to-end tests (Playwright)

- [ ] Does an end-to-end test cover each critical user path?
- [ ] Do selectors use roles and labels, not CSS classes?
- [ ] Do tests wait for conditions and never use fixed sleeps?
- [ ] Does each test create its own data?

## Before you report done

- [ ] Does the suite pass three times in a row?
- [ ] Did you cover each error path and each permission rule?
- [ ] Did you remove each `.only` and each `.skip` you added?
- [ ] Did you fix or file a `bd` issue for each flaky test?
- [ ] Did you test the bug fix with a test that failed before the fix?
- [ ] Did `pnpm check` pass, and do you report the exact result?

## Related

- [[AI/jobs/index]]: Table of role checklists. Pick the roles of your task and run each checklist before you report done.
