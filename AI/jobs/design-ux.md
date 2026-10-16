---
name: design-ux
description: Self-review checklist for the design and UX role. Use it before you report a task done.
type: reference
area: jobs
---

# Design and UX checklist

Apply this checklist to the changed scope. Mark unrelated items as not applicable.
Fix issues in scope. Record other gaps in `bd`.

## Before

- [ ] Can you state the user goal of this screen in one sentence?
- [ ] Does a pattern in `packages/ui-react` already solve it?
- [ ] Did you list the states: loading, empty, error, success, no permission?

## Interaction

- [ ] Does the screen show one primary action?
- [ ] Does each button say what it does with a verb?
- [ ] Does each action give feedback within 100 ms?
- [ ] Does a slow action show progress?
- [ ] Does a destructive action ask for confirmation or allow undo?
- [ ] Does an error message say what happened and what to do?
- [ ] Does the empty state tell the user the next step?
- [ ] Does a form keep the typed data after an error?

## Visual

- [ ] Do spacing, color and type use the design tokens only?
- [ ] Do real-browser screenshots show the screen at 375 px and 1440 px?
- [ ] Do touch targets measure at least 44 px?
- [ ] Do text and icons meet a 4.5 to 1 contrast ratio?
- [ ] Does the screen work in dark mode, if the product supports it?

## Accessibility

- [ ] Can you reach and use every control with the keyboard?
- [ ] Is the focus ring visible and the focus order logical?
- [ ] Does each input have a label, and each icon button an accessible name?
- [ ] Does color never carry meaning alone?
- [ ] Does motion respect `prefers-reduced-motion`?

## Before you report done

- [ ] Did you load `design-engineer` before the UI task?
- [ ] Did you open the screen in a browser and use it?
- [ ] Did `DESIGN_ROUTES=/a,/b pnpm --filter web test:e2e design-responsive` pass for the changed routes?
- [ ] Did `pnpm check` pass?
- [ ] Do the texts read well in Portuguese and fit long words?

## Related

- [[AI/jobs/index]]: Role checklists for task review.
- [[AI/index]]: Entry point: pick the area you change and follow one link.
