---
name: creating-a-component
description: Where a new component, screen or feature lives and how to build it.
type: how-to
area: frontend
---

# How to create a component

## Choose where it lives

| It is...                                           | Put it in                                       |
| -------------------------------------------------- | ----------------------------------------------- |
| A generic primitive with no product words          | `components/ui/` (shadcn style)                 |
| Generic behavior reusable by another product       | `packages/ui-react/src` (see [[AI/core/core]])  |
| A piece of one capability (games, queue, wishlist) | `features/<capability>/`                        |
| A route                                            | `pages/<Name>Page.tsx`, a wrapper over a screen |

## Steps

1. Create `features/<capability>/<Name>.tsx` with a named export and a typed props interface. Keep screens and hooks in separate files.
2. Style with Tailwind classes and `cn()` from `@/lib/utils`. Use theme tokens (`bg-card`, `text-muted-foreground`, `border-border`), never hex values. See [[AI/frontend/visual-identity]].
3. Build on shadcn components from `components/ui`. A variant is a `cva` entry in that component, not a one-off class string.
4. Read server data through TanStack Query with keys from `useQueryKeys()`. Follow [[AI/frontend/data-and-state]].
5. Export through the feature's `index.ts` and import from there.
6. Give every interactive element an accessible name, keyboard operation and visible focus. Use the ui-react state components (`EmptyState`, `ErrorState`) for empty and error states.
7. Check: `pnpm check`, then open the page in `pnpm dev` and use it with the keyboard.

## Rules

- A component receives data and callbacks; it does not call `fetch` itself.
- Server state lives in the query cache; local UI state lives in `useState`.
- A shared piece used in two features moves up to `components/ui` or `packages/ui-react`.

## Related

- [[AI/frontend/frontend]]: Folder map of apps/web and the map of frontend notes.
- [[AI/patterns/design-patterns]]: Design patterns in use, where they live, and how to expand a class.
