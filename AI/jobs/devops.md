---
name: devops
description: Self-review checklist for the devops role. Use it before you report a task done.
type: reference
area: jobs
---

# DevOps checklist

Apply this checklist to the changed scope. Mark unrelated items as not applicable.
Fix issues in scope. Record other gaps in `bd`.

## Before

- [ ] Did you check which environments the change reaches: preview, homologacao, production?
- [ ] Do you know how to roll the change back?

## Pipeline

- [ ] Does CI run install, lint, typecheck, test and build?
- [ ] Does CI use `pnpm install --frozen-lockfile`?
- [ ] Is the Node version and the pnpm version fixed in one place?
- [ ] Does CI cache the pnpm store?
- [ ] Do Playwright tests run in CI against a preview or a local build?
- [ ] Does a failed check block the merge?
- [ ] Does a workflow limit its token permissions to the minimum?

## Deploy

- [ ] Does the branch flow stay `feat/*`, then `homologacao`, then `main`?
- [ ] Does each pull request get a Vercel preview deployment?
- [ ] Does `vercel.json` hold only what the dashboard cannot hold?
- [ ] Does the build output stay deterministic with the same commit?
- [ ] Do migrations run before the code that needs them, and in a safe order?
- [ ] Does a deploy keep the previous version available for rollback?

## Configuration

- [ ] Does each new environment variable exist in every environment that needs it?
- [ ] Do approved configuration notes list each new variable name without secret values?
- [ ] Do you keep secrets out of build logs?

## Before you report done

- [ ] Did you run the changed script or workflow, or a dry run of it?
- [ ] Do the Vercel deployment logs show no error?
- [ ] Did you update the how-to note for the changed process?
- [ ] Did `pnpm check` pass?

## Related

- [[AI/jobs/index]]: Role checklists for task review.
- [[AI/index]]: Entry point: pick the area you change and follow one link.
