---
name: visual-identity
description: Design tokens, themes, accents and styling rules.
type: reference
area: frontend
---

# Visual identity

Calm, readable and green: a neutral off-white or deep green-black surface, one accent color, soft rounded cards and categorical colored badges. The source of truth is the token block at the top of `apps/web/src/styles.css`; Tailwind and shadcn names are mapped to those tokens in `apps/web/src/index.css`.

## Themes and accents

`<html data-theme="light|dark">` and `<html data-accent="green|blue|violet|orange|rose">` switch palettes. An inline script in `index.html` sets them before first paint; `apps/web/src/appearance` stores the choice. Derived tones (soft, line, ink, hover) come from `color-mix` on `--accent`, so a new accent defines only two colors.

## Tokens

| Token (Tailwind name)                | Use                                                              |
| ------------------------------------ | ---------------------------------------------------------------- |
| `--bg` (`background`)                | Page                                                             |
| `--surface` (`card`, `popover`)      | Cards and overlays                                               |
| `--surface-2` (`secondary`, `muted`) | Quiet fills                                                      |
| `--text`, `--text-2`, `--muted`      | Primary, secondary, helper text                                  |
| `--accent` (`primary`)               | Primary actions, focus ring                                      |
| `--accent-soft` (`accent`)           | Hover and selected fills                                         |
| `--danger` (`destructive`)           | Errors and destructive actions                                   |
| `--b-<color>-bg`, `--b-<color>`      | Categorical badge pairs (green, blue, amber, violet, rose, gray) |

## Type, shape, motion

- Font: DM Sans (Manrope for display accents), loaded in `styles.css`.
- Radius: 6, 8 and 14 px (`rounded-sm`, `rounded-md`, `rounded-lg`); badges are fully rounded.
- Dark mode uses the same token names; never branch on the theme in a component. The theme toggle in `Shell.tsx` is the one exception.
- Respect `prefers-reduced-motion`; contrast of text on every accent must stay readable.

## Rules

- Use tokens, never raw hex values, in components. Brand SVG art (`SwordLoader.tsx`) is exempt.
- A new category color is a new `--b-*` pair in both themes.
- Change the identity in `styles.css` first, then update this note.

## Related

- [[AI/frontend/frontend]]: Folder map of apps/web and the map of frontend notes.
- [[AI/frontend/creating-a-component]]: Where a new component, screen or feature lives and how to build it.
