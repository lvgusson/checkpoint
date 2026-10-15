---
name: loader
description: The reusable Loader in the UI kit, the app's AppLoader, props, how to add art and how another app reuses it.
type: reference
area: frontend
---

# Loader

Result: one loader for the whole app. The animated art sits above the phrase. Every loading state uses it.

## Layers

| Layer   | File                                         | Job                                                                       |
| ------- | -------------------------------------------- | ------------------------------------------------------------------------- |
| Kit     | `packages/ui-react/src/Loader.tsx`           | Product-agnostic `Loader` and `registerLoaderArt`. No sword, no `apps/*`. |
| App     | `apps/web/src/features/loader/AppLoader.tsx` | Picks the art, sets the default label `Carregando…`, registers `sword`.   |
| App art | `apps/web/src/features/loader/SwordArt.tsx`  | The bonfire sword SVG, registered as variant `sword`.                     |

## Props of `Loader`

| Prop          | Type                             | Meaning                                                               |
| ------------- | -------------------------------- | --------------------------------------------------------------------- |
| `label`       | `string`                         | Phrase under (or beside) the art. Also the accessible name.           |
| `art`         | `ReactNode`                      | Any custom animation. Wins over `src` and `variant`.                  |
| `src`         | `string`                         | URL or path of an SVG or image. Drawn as `<img alt="">`.              |
| `variant`     | `string`                         | Name given to `registerLoaderArt`. An unknown name shows the spinner. |
| `size`        | `number` or `'sm'` `'md'` `'lg'` | Art box in px. `sm` 20, `md` 40 (default), `lg` 64.                   |
| `layout`      | `'stacked'` or `'inline'`        | `stacked`: art above phrase (default). `inline`: side by side.        |
| `fill`        | `'inline'` `'block'` `'screen'`  | Hug the content (default), fill the width, or center in the viewport. |
| `data-testid` | `string`                         | Test ID on the root. Convention: `loader-<where>`.                    |

The art order is `art`, then `src`, then `variant`, then the default CSS spinner.
The root has `role="status"`, `aria-live="polite"` and `aria-busy="true"`. The label is also its `aria-label`.
Under `prefers-reduced-motion` the spinner stops. Styles use the `ckl` class prefix and one `<style>` tag that React 19 emits once.

## Add a new art

1. Write the art as an element or a component. A component gets `size` in px. The art box already sizes `<svg>` and `<img>` to 100%.
2. Call `registerLoaderArt('my-art', MyArt)` once, at module scope.
3. Use it with `<AppLoader variant="my-art" />`, or set the default with `VITE_LOADER_ART=my-art`.

## Environment variable

`VITE_LOADER_ART` is the default `variant` of `AppLoader`. When it is empty the default is `sword`. A `variant` prop on one `AppLoader` wins.

## Use it in another app

1. Import from the kit: `import { Loader, registerLoaderArt } from '@checkpoint/ui-react'`.
2. Pass the art directly: `<Loader label="Loading…" art={<MyAnimation />} />` or `<Loader src="/spinner.svg" />`.
3. Or register a name once and use `variant`. With none of these the kit shows its CSS spinner.

## Where the app uses it

Search for `AppLoader` in `apps/web/src`. Test IDs are listed in [[AI/frontend/testid-map]].

## Tests

`packages/ui-react/src/Loader.test.tsx` renders to a string with `react-dom/server`. Run `pnpm vitest run --project ui-react`.
The `ui-react` project in `vitest.config.ts` borrows the React copy installed for `apps/web`, because the kit lists React only as a peer.

## Related

- [[AI/frontend/frontend]]: Folder map of apps/web and the map of frontend notes.
- [[AI/frontend/testid-map]]: Stable test IDs for every screen, including loaders.
- [[AI/core/core]]: `packages/core` contracts and the `packages/ui-react` kit.
