---
name: design-ux
description: Self-review checklist for the design and UX role. Use it before you report a task done.
type: reference
area: jobs
---

# Design and UX checklist

Answer every item with yes, no or not applicable. Fix each no before you report done.

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
- [ ] Does the screen work at 360 px width and at desktop width?
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

- [ ] Did you open the screen in a browser and use it?
- [ ] Do the texts read well in Portuguese and fit long words?

## Related

- [[AI/jobs/index]]: Table of role checklists. Pick the roles of your task and run each checklist before you report done.
