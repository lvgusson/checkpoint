---
name: performance
description: Self-review checklist for the performance role. Use it before you report a task done.
type: reference
area: jobs
---

# Performance checklist

Answer every item with yes, no or not applicable. Fix each no before you report done.

## Before

- [ ] Did you measure the current speed and write down the number?
- [ ] Do you have a target, for example LCP under 2.5 s or API p95 under 300 ms?

## Frontend

- [ ] Does the bundle size stay within the budget after your change?
- [ ] Does each route load only the code it needs?
- [ ] Do you avoid large libraries when a small function does the job?
- [ ] Do images have size, modern format, lazy loading and explicit dimensions?
- [ ] Do fonts use `font-display` and a small subset?
- [ ] Do long lists use pagination or virtualization?
- [ ] Do you avoid re-renders of large trees, checked with the React profiler?
- [ ] Do inputs that trigger requests use debounce?
- [ ] Does the page avoid layout shift (CLS under 0.1)?

## Backend and database

- [ ] Does each hot query use an index, checked with `EXPLAIN (ANALYZE)`?
- [ ] Do you avoid N+1 queries and repeated reads?
- [ ] Does each list endpoint paginate and cap the page size?
- [ ] Does each response send only the fields the client needs?
- [ ] Do slow or repeated reads use a cache with a clear expiry rule?
- [ ] Do independent calls run in parallel?
- [ ] Do cold starts of functions stay within the target?

## Before you report done

- [ ] Did you measure again and write the before and after numbers?
- [ ] Did you test with a realistic amount of data?
- [ ] Did you test on a slow network and a slow device setting?
- [ ] Did you file a `bd` issue for each known slow path you leave?

## Related

- [[AI/jobs/index]]: Table of role checklists. Pick the roles of your task and run each checklist before you report done.
