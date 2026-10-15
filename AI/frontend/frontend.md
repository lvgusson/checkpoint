---
name: frontend
description: Folder map of apps/web and the map of frontend notes.
type: hub
area: frontend
---

# Frontend (`apps/web`)

React 19, Vite, TypeScript, react-router, TanStack Query, Ky, Zod, react-hook-form, Tailwind v4 and shadcn/ui (Radix). User-facing text is Portuguese; identifiers and comments are English.

## Folder map (`apps/web/src`)

| Folder                    | Holds                                                                                     |
| ------------------------- | ----------------------------------------------------------------------------------------- |
| `pages/`                  | One route component per page; it renders a feature screen (large pages also hold queries) |
| `features/`               | One folder per capability: screen, hooks, model, styles, `index.ts`                       |
| `components/ui/`          | shadcn primitives in use (button, select, popover, calendar, ...)                         |
| `app/`                    | Shell, navigation, route table                                                            |
| `api/`, `auth/`, `query/` | HTTP client, session, query keys and client                                               |
| `appearance/`             | Theme and accent state                                                                    |

## Where to go

- Build a new component, screen or feature: [[AI/frontend/creating-a-component]]
- Colors, typography, spacing, themes: [[AI/frontend/visual-identity]]
- Fetching, caching, optimistic updates, errors: [[AI/frontend/data-and-state]]
- Reusable list, pagination, drag and drop pieces: [[AI/core/core]]
- Loading states and the reusable loader: [[AI/frontend/loader]]
- Infinite scroll pagination: [[AI/frontend/infinite-scroll]]
- Browser event tracking: [[AI/backend/tracking]]: Fire-and-forget client tracking queue and listener.
- Run or write Playwright browser tests: [[AI/frontend/e2e-testing]]
- Route map and request timings for Playwright tests: [[AI/frontend/e2e-route-map]]

## Related

- [[AI/frontend/testid-map]]: Stable test IDs and destructive actions for every application screen.

- [[AI/index]]: Entry point: pick the area you change and follow one link.
- [[AI/patterns/design-patterns]]: Design patterns in use, where they live, and how to expand a class.
