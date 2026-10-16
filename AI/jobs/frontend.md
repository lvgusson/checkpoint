---
name: frontend
description: Self-review checklist for the frontend role. Use it before you report a task done.
type: reference
area: jobs
---

# Frontend checklist

Apply this checklist to the changed scope. Mark unrelated items as not applicable.
Fix issues in scope. Record other gaps in `bd`.

## Before

- [ ] Did you read the matching note in `AI/frontend`?
- [ ] Does a component in `packages/ui-react` already do this job?
- [ ] Does the data you need already exist in a hook or a query?
- [ ] Did you list the states of the screen: loading, empty, error, success, offline?

## During

- [ ] Does the component use TypeScript types with no `any`?
- [ ] Does the code import types and schemas from `packages/core` and not copy them?
- [ ] Does the code stay out of `apps/api` internals?
- [ ] Does server data go through one query layer, with cache keys that name the inputs?
- [ ] Does each effect have a cleanup and a correct dependency list?
- [ ] Do you derive state during render instead of copying props into state?
- [ ] Does every form validate input and show an error next to the field?
- [ ] Does every list have a stable key that is not the array index?
- [ ] Does each route lazy-load its code when the route is large?
- [ ] Does the UI show a user message when a request fails?
- [ ] Do all text strings come from one place, ready for translation?
- [ ] Does the code contain no secret, no service-role key and no hard-coded URL?
- [ ] Does the code avoid `dangerouslySetInnerHTML` on user content?

## Before you report done

- [ ] Does a Vitest test cover the new logic and each state?
- [ ] Do real-browser screenshots show the screen at 375 px and 1440 px?
- [ ] Did the responsive accessibility test pass for the changed routes?
- [ ] Can you use the screen with the keyboard only?
- [ ] Does the browser console show no error and no warning?
- [ ] Did you remove `console.log`, dead code and unused imports?
- [ ] Did `pnpm check` pass?

## Related

- [[AI/jobs/index]]: Role checklists for task review.
- [[AI/index]]: Entry point: pick the area you change and follow one link.
