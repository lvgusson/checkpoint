---
name: testid-map
description: Stable test IDs and destructive actions for every application screen.
type: reference
area: frontend
---

# Test ID map

- Attribute: `data-testid="<screen>-<element>[-<index or key>]"`, in lowercase kebab-case.
- Screens: `nav`, `login`, `library`, `detail`, `queue`, `wishlist`, `settings`, `modal`, `dialog`, `loader`.
- Every button, link, input, select, toggle, tab, menu item, sortable handle, and dialog action has an ID.
- Dynamic lists use game codes or domain IDs. They never use array indexes.
- A ui-react component forwards `data-testid` to its root. Its actions add suffixes to that ID.
- IDs never use translated display text. Fixed status and desire choices use contract keys.
- `<code>` means a game code; `<id>` means a list or Steam ID; `<key>` means a contract key.
- `<value-key>` encodes a stored catalog key as hexadecimal Unicode code points.
- Braces list alternatives (e.g. `login-{email,password}`). Actionless status: `{queue,settings}-lists`, `wishlist-error`.
- Tests skip destructive actions or restore original state. Persisted writes use `yes` below.

## Nav

| Test ID                                                             | Action                                    | Destructive? |
| ------------------------------------------------------------------- | ----------------------------------------- | ------------ |
| `nav-{desktop,mobile}-{library,wishlist,queue,settings,appearance}` | Open a screen.                            | no           |
| `nav-brand-{desktop,mobile}`, `nav-skip-content`                    | Open the queue or focus the main content. | no           |
| `nav-theme-toggle`                                                  | Change the browser theme.                 | no           |
| `nav-logout`                                                        | End the session.                          | yes          |

## Login

| Test ID                                                            | Action                                       | Destructive? |
| ------------------------------------------------------------------ | -------------------------------------------- | ------------ |
| `login-tab-{login,signup}`, `login-{back,forgot,recovery-request}` | Choose the authentication form.              | no           |
| `login-{email,password,confirm-password,password-toggle}`          | Enter credentials or toggle visibility.      | no           |
| `login-submit-login`, `login-github`                               | Start a session.                             | no           |
| `login-submit-{signup,forgot,reset}`                               | Create an account or change password access. | yes          |

## Library

| Test ID                                                                       | Action                                           | Destructive? |
| ----------------------------------------------------------------------------- | ------------------------------------------------ | ------------ |
| `library-open-queue`, `library-game-<code>`                                   | Open the queue or game page.                     | no           |
| `library-search`, `library-filter-{status,genre,store}`, `library-sort`       | Search, filter, or sort games.                   | no           |
| `library-playing-<code>`, `library-immediate-<code>`, `library-finish-<code>` | Change status, priority, or open completion.     | yes          |
| `library-purchase-<code>`, `library-unpurchase-<code>`                        | Open purchase or unpurchase confirmation dialog. | no           |

## Detail

| Test ID                                                                       | Action                                          | Destructive? |
| ----------------------------------------------------------------------------- | ----------------------------------------------- | ------------ |
| `detail-{back,open-queue,time-source,imported-data}`                          | Navigate or show imported data.                 | no           |
| `detail-rating-{1,2,3,4,5}`, `detail-rating-clear`, `detail-auto-finish`      | Edit rating and completion preferences.         | no           |
| `detail-{actual-hours,name,main-hours,extra-hours,completionist-hours,notes}` | Edit game fields.                               | no           |
| `detail-{status,desire,genre,tags,pace,mechanic,structure,store,platform}`    | Open a metadata selector.                       | no           |
| `<selector>-option-<key or value-key>`                                        | Choose metadata in the open detail selector.    | no           |
| `detail-prerequisite-search`, `detail-prerequisite-result-<code>`             | Find or choose a prerequisite.                  | no           |
| `detail-prerequisite-remove`                                                  | Remove the prerequisite from the form.          | yes          |
| `detail-{finished-at,started-at}`                                             | Open a date picker.                             | no           |
| `<picker>-calendar-{previous,next,day-YYYY-MM-DD}`                            | Change month or select a date.                  | no           |
| `<picker>-clear`                                                              | Clear the form date.                            | no           |
| `detail-finish`, `detail-notes-save`                                          | Open completion or save all edited game fields. | yes          |
| `detail-save-status`                                                          | Save message: "Salvo..." after a save.          | no           |

## Queue

| Test ID                                                                         | Action                                                 | Destructive? |
| ------------------------------------------------------------------------------- | ------------------------------------------------------ | ------------ |
| `queue-{search,search-clear,notice-close,excluded-open}`                        | Search, dismiss notices, or show exclusions.           | no           |
| `queue-game-<code>`, `queue-playing-detail-<code>`, `queue-next-<code>`         | Open game details.                                     | no           |
| `queue-load-more`                                                               | Infinite scroll sentinel (not a button).               | no           |
| `queue-recalculate`                                                             | Recalculate recommendations.                           | no           |
| `queue-retry`, `queue-lists-retry`, `queue-lists-reload`                        | Retry the queue or the lists request.                  | no           |
| `queue-tags-popover-<code>`                                                     | Open metadata popover (mobile).                        | no           |
| `queue-{playing,immediate,finish}-<code>`, `queue-{purchase,unpurchase}-<code>` | Change status, priority, purchase, or open completion. | yes          |
| `queue-row-<code>`, `queue-drag-<code>`, `queue-release-<code>`                 | Reorder games or remove a fixed position.              | yes          |
| `queue-list-{trigger,actions}`, `queue-list-select-<id>`                        | Open list menus or select a list.                      | no           |
| `queue-list-rename-<id>`, `queue-list-{rename-current,create,name,cancel}`      | Edit a list name or cancel editing.                    | no           |
| `queue-list-{save,remove}`                                                      | Save a list or request its deletion.                   | yes          |

## Wishlist

| Test ID                                                                   | Action                                      | Destructive? |
| ------------------------------------------------------------------------- | ------------------------------------------- | ------------ |
| `wishlist-{steam-search,desire,manual-open,import-open,sort}`             | Search, choose desire, open forms, or sort. | no           |
| `wishlist-manual-{name,genre,hours}`, `wishlist-steam-profile`            | Enter game or profile data.                 | no           |
| `wishlist-game-<code>`                                                    | Open game details.                          | no           |
| `wishlist-prices-refresh`                                                 | Refresh stored prices.                      | yes          |
| `wishlist-steam-add-<id>`, `wishlist-manual-add`, `wishlist-steam-import` | Add games or import a wishlist.             | yes          |
| `wishlist-purchase-<code>`                                                | Open the purchase dialog.                   | no           |
| `wishlist-load-more`                                                      | Infinite scroll sentinel.                   | no           |
| `wishlist-error-retry`                                                    | Retry the wishlist request.                 | no           |

## Settings

| Test ID                                                                                                      | Action                                                        | Destructive? |
| ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------- | ------------ |
| `settings-{retry,notice-close,open-queue}`, `settings-filter-tags`                                           | Retry, dismiss a notice, open the queue, or show tag filters. | no           |
| `settings-lists-retry`, `settings-lists-reload`                                                              | Retry the lists request.                                      | no           |
| `settings-weight-<key>`, `settings-rule-<key>`                                                               | Edit a weight or rule.                                        | no           |
| `settings-filter-<key>-<value-key>`                                                                          | Toggle a catalog filter.                                      | no           |
| `settings-filter-{min-hours,max-hours,exclude-unknown-hours,min-desire,coop-only}`, `settings-filters-clear` | Edit or clear content filters.                                | no           |
| `settings-list-{trigger,actions}`, `settings-list-select-<id>`                                               | Open list menus or select a list.                             | no           |
| `settings-list-rename-<id>`, `settings-list-{rename-current,create,name,cancel}`                             | Edit a list name or cancel editing.                           | no           |
| `settings-list-{save,remove}`                                                                                | Save a list or request its deletion.                          | yes          |
| `settings-catalog-{category,name}`                                                                           | Choose a catalog or enter its new option.                     | no           |
| `settings-catalog-add`, `settings-catalog-remove-<category>-<value-key>`                                     | Add or delete shared catalog options.                         | yes          |
| `settings-discard`, `settings-reset`, `settings-save`                                                        | Discard edits, request defaults, or save settings.            | yes          |
| `settings-theme-{system,light,dark}`, `settings-accent-<key>`, `settings-logo-<key>`, `settings-logo-upload` | Change browser appearance.                                    | no           |
| `settings-logo-remove`, `settings-appearance-reset`, `settings-logout`                                       | Remove an image, reset appearance, or end the session.        | yes          |

## Modal

The dialog takes focus on open (`tabIndex=-1`). `modal-close` is not auto-focused.

| Test ID                                                  | Action                                              | Destructive? |
| -------------------------------------------------------- | --------------------------------------------------- | ------------ |
| `modal-game-<code>`, `modal-close`, `modal-open-detail`  | Dismiss the backdrop, close, or open the full page. | no           |
| `modal-game-retry`, `modal-catalog-retry`                | Retry loading game details or metadata catalog.     | no           |
| `modal-catalog-{error,loading}`                          | Read catalog error alert or loading status.         | no           |
| `modal-{status,desire,genre,tags}`                       | Open metadata selector or tag combobox.             | no           |
| `modal-{status,desire,genre,tags}-option-<key>`          | Choose or persist status, desire, or tag changes.   | yes          |
| `modal-badge-tags`, `modal-badge-tags-{mobile,overflow}` | Display game tag badges or open mobile overflow.    | no           |
| `modal-notes`, `modal-notes-save`, `modal-finish`        | Edit notes, save notes, or open game completion.    | yes          |

## Dialog

| Test ID                                                                                       | Action                                                       | Destructive? |
| --------------------------------------------------------------------------------------------- | ------------------------------------------------------------ | ------------ |
| `dialog-finish-<code>`, `dialog-finish-{drag,cancel}`                                         | Dismiss the backdrop, drag the sheet, or cancel completion.  | no           |
| `dialog-finish-rating-{1,1-5,2,2-5,3,3-5,4,4-5,5}`, `dialog-finish-{hours,notes}`             | Enter completion details.                                    | no           |
| `dialog-finish-save`                                                                          | Finish the game and save its rating, hours, date, and notes. | yes          |
| `dialog-list-remove-<id>-cancel`, `dialog-settings-reset-cancel`, `dialog-purchase-cancel`    | Cancel deletion, reset, or purchase.                         | no           |
| `dialog-list-remove-<id>-confirm`, `dialog-settings-reset-confirm`, `dialog-purchase-confirm` | Delete a list, reset settings, or confirm game purchase.     | yes          |

## Loader

| Test ID                                                                                                                                               | Action                                                    | Destructive? |
| ----------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- | ------------ |
| `loader-{detail,queue,modal,sword,catalog,route,settings,wishlist}`, `loader-{library,prerequisite}{-more,-search,}`, `loader-{queue,settings}-lists` | Read loading status. Loaders have no interactive actions. | no           |

Date-time picker variants also expose `<picker>-{hour,minute,clear,done}` and `<picker>-{hour,minute}-<value>`. Native selects use their option values. Sortable handles use Space, arrows, Space, and Escape.

## Related

- [[AI/frontend/frontend]]: Folder map of apps/web and the map of frontend notes.
- [[AI/frontend/data-and-state]]: Query policies, modal deadlines, and error handling.
- [[AI/frontend/loader]]: The reusable Loader, its props and how to add art.
- [[AI/frontend/e2e-route-map]]: Route map table of steps, actions and request timings for end-to-end testing.
