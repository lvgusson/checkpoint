---
name: design-engineering
description: How agents design and verify UI in Checkpoint: skill, responsive and a11y spec, browser exploration.
type: how-to
area: frontend
---

# Design engineering

Agents design in code and check the result in a real browser. Source of the workflow: repo `lvgusson/design-project`, skill `design-engineer`.

## Check a screen

1. Start the app: `pnpm dev`.
2. Explore: `playwright-cli open http://localhost:5173`, then `resize 375 812` and `screenshot --filename=apps/web/test-results/design/x.png`. Config: `.playwright/cli.config.json`.
3. Run the gate: `DESIGN_ROUTES=/,/jogos pnpm --filter web test:e2e design-responsive`.
   - Widths: 320, 375, 768, 1024, 1440.
   - Fails on horizontal overflow or any axe WCAG 2.2 AA violation.
   - Screenshots go to `apps/web/test-results/design/` (ignored by git).
4. Run `pnpm check`.

## Rules

- Reuse `packages/ui-react` and the tokens in [[AI/frontend/visual-identity]].
- Use the test IDs in [[AI/frontend/testid-map]] for flows.
- Report any skipped check as NOT RUN.

## Related

- [[AI/frontend/frontend]]: Frontend hub.
- [[AI/frontend/e2e-testing]]: How E2E tests run.
- [[AI/frontend/creating-a-component]]: Where a new component, screen or feature lives and how to build it.
