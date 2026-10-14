---
type: hub
area: frontend
---

# Frontend (`apps/web`)

React 19, Vite, TypeScript, react-router, TanStack Query, Ky, Zod, react-hook-form, Tailwind v4 and shadcn/ui (Radix). User-facing text is Portuguese; identifiers and comments are English.

## Folder map (`apps/web/src`)

| Folder                    | Holds                                                               |
| ------------------------- | ------------------------------------------------------------------- |
| `pages/`                  | One thin route component per page; it renders a feature screen      |
| `features/`               | One folder per capability: screen, hooks, model, styles, `index.ts` |
| `components/ui/`          | shadcn primitives (button, dialog, select, ...)                     |
| `app/`                    | Shell, navigation, route table                                      |
| `api/`, `auth/`, `query/` | HTTP client, session, query keys and client                         |
| `appearance/`             | Theme and accent state                                              |

## Where to go

- Build a new component, screen or feature: [[AI/frontend/creating-a-component]]
- Colors, typography, spacing, themes: [[AI/frontend/visual-identity]]
- Fetching, caching, optimistic updates, errors: [[AI/frontend/data-and-state]]
- Reusable list, pagination, drag and drop pieces: [[AI/core/core]]

## Related

- [[AI/index]]
- [[AI/patterns/design-patterns]]
