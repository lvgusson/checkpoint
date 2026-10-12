# Implementation handoff

Date: 2026-10-12

Workspace: `C:/Users/lucas/Downloads/checkpoint-node-angular/checkpoint`

The implementation was continued on 2026-10-12. Changes remain local and uncommitted. No push or deployment was performed. The controlled metadata migration has now been applied to the authorized database.

## Continuation result

### Controller latency follow-up

- The controller now changes status, section membership, start date, queue positions, hours, and library counts optimistically. Persistence lives in the singleton API service so moving a game between sections does not interrupt the request.
- Rapid toggles retain the latest intent. Writes for the same game are serialized, and other edits wait for pending playing changes. Failure restores the confirmed state; a direct read also handles responses that fail after persistence.
- Reconciliation invalidates pre-mutation reads and forces fresh queue/library/catalog data. Cached responses cannot replace pending changes, and destroyed screens ignore asynchronous callbacks.
- The previous UI waited for both PATCH and queue reload. PATCH also performed serial cleanup across lists and separate reads for the library and scoring settings. Cleanup now runs concurrently and the combined input reader reduces response reads while preserving scoring semantics.
- The local `.env` points to a remote Supabase transaction pooler on port 6543. Running the frontend and API locally still incurs remote database round trips. No production game state was changed for latency measurements.
- Validation: 91 tests passed, one opt-in PostgreSQL test skipped; API typecheck, project ESLint, and Angular production build passed. The integrated browser was unavailable, so interactive browser verification could not run.
- Reviewed pending local branches independently. Their feature behavior is already present in `main`; the remaining divergence contains obsolete release behavior and comments. Recording integration ancestry must preserve the current tree.

- Applied `supabase/migrations/20261012134709_controlled_metadata.sql`, mirroring numbered migration 016. Verified the migration history, all three validated foreign keys, RLS on the new reference tables, working catalog reads, and preservation of 550 games and 1,138 game-tag relationships.
- Preserved trusted Steam importer vocabulary extension while restricting manual creation to canonical controlled values. Manual wishlist genre now uses a catalog dropdown. Local catalogs include persisted imported metadata so those values remain editable.
- Completed queue and playing badge icons/colors. Fixed detail/dropdown colors that had incorrectly been used as CSS classes. Hid the ineffective `inProgress` settings factor while preserving stored/API keys.
- Enforced predecessor access and rejected dependency cycles. Verified live name search, accent normalization, literal wildcard/backslash matching, self exclusion, and library isolation using read-only queries.
- Updated queue counts/digest for 392 upcoming games, with the two playing games verified separately. The original static HTML assertion passed unchanged.
- Integrated Angular build, API typecheck, and focused lint passed. Focused service/settings validation passed 18/18. Metadata/Steam validation initially identified an obsolete manual `RPG` fixture, updated to the controlled `RPG de ação` option.
- The user explicitly requested concise validation instead of exhaustive test/review workflows. No full test suite, browser interaction pass, independent final review, deployment, or push was performed during continuation.

The remaining sections below describe the original handoff and its historical pending items; the continuation result above supersedes them.

## User requirements and latest decisions

- Persist multiple games being played in parallel and show them in a separate section above the upcoming game queue.
- Preserve the sword's immediate-priority action. Add a distinct game-controller action to change status to `Jogando` and automatically record today's start date. Prioritizing a game must not start it.
- Improve game details on mobile. Genre, secondary tags, pace, mechanic, store, structure, and platform must use controlled dropdown options. Configure colors and icons centrally and use them in details and the queue.
- Replace predecessor-ID entry with a name search after at least three characters. Search the database, show a small cover and a single-line truncated game name, and persist the selected predecessor's existing ID.
- Remove the queue's "Como sua ordem é calculada" explanation. Move information into settings only when it is not already present.
- Keep list controls aligned and stable when creating or renaming. Provide a rename pencil within each list dropdown option.
- **Latest correction supersedes the original external plus/trash design:** on both desktop and mobile, put create, delete, and reload/recalculate actions in a floating three-dots menu to the right of the list selector.
- The floating menu must close when clicking outside it. Escape and choosing an action should also close it.
- The user authorized using subagents and applying migrations, including normalizing existing metadata. Authorization exists; the migration is still pending.

## Project harness removal completed before this task

The user explicitly asked to remove the project hooks and mandatory harness obligations. Do not reinstall or recreate them while continuing this work.

Completed and verified:

- Deleted `.husky`, including `pre-commit`, `pre-push`, and `commit-msg`.
- Deleted `.codex/hooks.json` and `.claude/settings.json`, which invoked the main-entry reader for every prompt.
- Deleted `AI/hooks/pre-commit.mjs`, `AI/hooks/pre-push.mjs`, `AI/read-main-entry.mjs`, and `AI/read-main-entry.ps1`.
- Removed the Husky `prepare` lifecycle script from `package.json`, preventing automatic hook installation by `npm install`.
- Unset local Git `core.hooksPath`; verified there were no active hooks in the default `.git/hooks` directory. Sample files remain inactive.
- Removed mandatory main-entry, architecture navigation/archive, branch-review, and release-registration instructions from `AGENTS.md`.
- `AGENTS.md` retains only English requirements for technical identifiers, comments, and documentation, plus the user's preferred conversation language. Conversation is Portuguese.
- Husky and commitlint dependencies and optional manual architecture scripts were not removed; they are not automatically invoked now.

Preexisting changes before the feature work: `AI/main-entry.md` was already empty/modified, `supabase/seed.sql` was modified, and `AI/project-review/` was untracked. Preserve these unrelated changes. The feature agents did not author those seed or project-review changes.

## Root agent: playing games, queue integration, and database search

### Mission

Coordinate the three subagents, implement the independent playing state above the queue, add the controller action, and provide database-backed predecessor search.

### Implemented

- `shared/models.ts`: added optional `Recommendations.playing?: ScoredGame[]`. Optionality permits older cached responses to render safely.
- `api/src/scoring.ts`: collect all `Jogando` games into `playing`, ordered by start date and then name/ID. Exclude them from upcoming queue eligibility and queue filter counts. Playing games remain visible regardless of list filters, endless-game restrictions, or competitive-game restrictions. Upcoming queue totals/hours exclude playing games.
- `api/src/service.ts`: when transitioning to `Jogando` without an existing start date, populate it. Clear stale manual queue positions in every list when a game transitions to `Jogando` or `Finalizado`.
- `web/src/playing.ts`: new reusable controller button. Starts or pauses a game without changing desire. Starting without a previous start date sends the browser's local calendar date; pausing returns status to `Não iniciado`, preserving the previous start date. Includes busy/error behavior and accessible labels.
- `web/src/queue.ts`: added the top "Jogando agora" section, start date display, pause/controller, immediate-priority, and completion actions. Added controller actions to upcoming queue rows. Updated optimistic desire handling to include playing games. Removed the old calculation-explanation block. Changed the projected recalculate button to a text menu item for the list picker's three-dots popup.
- `web/src/library.ts`: added controller buttons to library cards and reload catalog/counts after saved status changes.
- `web/src/styles.css`: added responsive playing-section styles and styles for the projected `app-list-picker .list-action` recalculate menu item.
- `api/src/repository.ts`: added optional `searchByName(query, excludeId)` repository capability.
- `api/src/pg-repository.ts`: added `searchByName` with current-user library filtering, normalized name matching, self exclusion, deterministic order, and a limit of 12. Escapes backslash, `%`, and `_` for literal LIKE matching. This file was also edited by the metadata subagent in separate sections.
- `api/src/service.ts`: added `searchGames`, rejecting queries longer than 120 characters, returning no results before three trimmed characters, and delegating to database search when available. JSON/offline repositories use a bounded fallback name search.
- `api/src/server.ts`: added authenticated `GET /api/v1/games/search?q=...&excludeId=...` before the generic game-ID route.
- `web/src/api.ts`: added `Api.searchGames(query, excludeId): Promise<ScoredGame[]>`, with no persisted typed-query cache.
- `api/test/scoring.test.ts`: added coverage for parallel playing games, list-filter independence, separate totals, and immediate desire remaining independent of playing status.
- `api/test/service.test.ts`: added coverage for start date persistence, unchanged desire, pin cleanup, parallel games, and returning a game to the queue.
- `api/test/settings.test.ts`: removed the contextual `inProgress` test case because playing games no longer compete in the upcoming queue.

### Verification observed

The two new playing tests first failed for the expected missing behavior, then passed after implementation. The most recent root run of `scoring.test.ts`, `service.test.ts`, and `settings.test.ts` completed with **23 passing and 4 failing tests**. It was run before all subagent work was finalized.

Remaining failures:

1. `service.test.ts`, HTTP/static-page test: `assert(html.includes('<app-root>'))` failed. Root cause has not been investigated fully. Check the generated `dist/web/browser/index.html`, the actual HTTP response, and whether the literal assertion still matches Angular output. Do not simply weaken the assertion.
2. `settings.test.ts`, default seed queue snapshot: still expects 394 games and the previous digest. Actual upcoming queue has 392 after separating two playing seed games. Update the test to the new semantics and compute/verify the new digest after confirming the partition.
3. `settings.test.ts`, filter-option candidate count: still expects 394; actual is 392.
4. `settings.test.ts`, scoring-settings HTTP test: same obsolete 394 filter-option expectation.

### Pending

- Add shared metadata icons/colors to queue genre/tag/status/desire badges and playing-section badges. These still use the old `color()` function without icons. The metadata presentation module is available, and detail already consumes it.
- Consider hiding or updating the now-ineffective `inProgress` configuration factor (`api/src/scoring-config.ts`); it still advertises a bonus for games in `Jogando`, although those games are no longer in the ranked queue. Preserve compatibility-sensitive stored config keys if removing the visible factor.
- Verify prerequisite ordering behavior when a predecessor is currently being played; current algorithm treats games outside the upcoming queue as not blocking a sequel, following its existing outside-queue policy.
- Verify database search against the live database, including literal wildcard characters, accents, minimum length, ownership isolation, and self exclusion. No live search query test was run yet.
- Add meaningful HTTP/repository tests for the new search route.
- Validate the predecessor exists and belongs to the user's accessible library when saving, and consider preventing dependency cycles. Current patch validation only rejects self-reference and invalid basic types; the new UI prevents arbitrary raw-ID entry but the API should still enforce the relationship.
- Review newly added root code for formatting/lint/typecheck. No final integrated root build or browser check was completed.

## Subagent: mobile_game_details

Canonical task: `/root/mobile_game_details`

### Mission

Improve game details on mobile, replace free-text metadata with controlled dropdowns, enrich metadata with colors/icons, and implement name-based predecessor selection.

### Implemented

Files owned:

- `web/src/detail.ts`
- `web/src/detail.css` (new)
- `web/src/metadata-select.ts` (new)
- `web/src/prerequisite-search.ts` (new)

Reported completed behavior:

- Genre, secondary tags, pace, mechanic, store, structure, and platform now use catalog dropdowns. Status/desire also use the improved control.
- Dropdown values and selected badges include configured colors and SVG icons from `metadata-presentation.ts`.
- Metadata dropdown supports outside click, Escape, keyboard arrows/Home/End, and a maximum of three secondary tags.
- Detail hero status/genre/tag badges use the shared presentation configuration.
- Mobile controls have larger touch targets and improved save/rating layouts.
- Predecessor search uses `Api.searchGames(query, excludeId)`, starts after three characters with a 300 ms debounce, ignores stale responses, excludes the current game, and shows small covers plus single-line names.
- A selected predecessor can be cleared; the persisted field remains `prerequisiteId`.
- Existing dirty-form protection remains in place.

### Verification reported

The subagent reported a successful Angular build, focused ESLint, and formatting checks after fixing an `ElementRef` typing issue. These are subagent checks at their completion point, **not a final integrated verification of all later root changes**.

### Pending

- Browser validation at mobile and desktop sizes, including long labels, dropdown placement, touch targets, keyboard behavior, and horizontal overflow.
- Real database predecessor searches after API integration.
- Regression checks for edits arriving during background cache refresh, predecessor clearing, and maximum-tag selection.

## Subagent: list_controls

Canonical task: `/root/list_controls`

### Mission

Fix responsive list controls and layout movement, provide per-list rename pencils, and avoid duplicate calculation explanations.

### Implemented

File owned: `web/src/lists.ts`.

Reported completed behavior:

- Selector expands to available row width with an adjacent 44 px three-dots trigger on both desktop and mobile.
- Floating actions menu contains create/delete plus projected recalculate content. Root changed the queue's projected recalculate button to `role="menuitem"`, `tabindex="-1"`, `class="list-action"`, and a visible label.
- List dropdown has a rename pencil for each list. A separate `editingId` ensures renaming the chosen list rather than necessarily the current list.
- Create/rename controls occupy a stable-height edit row, reducing vertical movement.
- Menu closes after outside pointer interaction, chosen actions, and Escape. Dropdown and actions menu are mutually exclusive.
- Supports Arrow/Home/End/Tab navigation and focus return.
- Inspected `web/src/settings.ts`: a live formula explanation already exists in the `formula-panel` titled "Como cada jogo é pontuado". No duplicate was added and no settings file change was necessary.
- Root removed the old queue explanation.

### Verification reported

Focused lint passed. An initial keyboard typing issue was fixed. Its build attempt at that time encountered concurrent metadata-component errors; the mobile agent subsequently reported its own successful build.

### Pending

- Browser verification of outside-click closing for both menus, Escape/focus behavior, opening/closing after projected recalculation, editing a noncurrent list, and mobile alignment.
- Confirm the create/rename heading/replacement text fully meets the user's request to avoid disappearing text and layout jumps.
- Confirm the projected root `list-action` styles look consistent with the menu's built-in actions.

## Subagent: metadata_catalog

Canonical task: `/root/metadata_catalog`

### Mission

Create controlled metadata catalogs, enforce allowed values, safely normalize legacy data, and provide shared presentation settings for detail and queue.

### Implemented

- `shared/models.ts`: extended `Catalog` with `paces`, `mechanics`, `structures`, and `platforms`.
- `shared/metadata.ts` (new): canonical static catalog fallback for offline/JSON mode.
- `api/src/repository.ts`: optional `metadataCatalog()` capability.
- `api/src/pg-repository.ts`: database-backed catalog reads; removed automatic vocabulary insertion from game `save()` so user edits select existing controlled entries.
- `api/src/service.ts`: richer catalog responses and touched-field metadata canonicalization/validation.
- `web/src/metadata-presentation.ts` (new): shared colors and SVG icon paths across metadata categories.
- `api/test/metadata.test.ts` (new): controlled-value validation test.
- `db/migrations/016_controlled_metadata.sql` (new): prepared SQL, **not applied**.
- `scripts/inspect-metadata.mjs` and `scripts/generate-metadata.mjs` (new): implementation helpers, currently retained.

The agent safely inspected database metadata without printing credentials: 29 genres, 121 tag labels, 21 mechanics, and 6 stores. Existing vocabulary tables are retained as controlled enum catalogs. New pace/structure/platform reference tables and foreign keys are planned rather than destructive replacement of all vocabulary with PostgreSQL native enums. Existing status/desire are already native enums.

Prepared migration preserves existing vocabulary values, normalizes structure aliases such as unspaced `Campanha+...` to canonical spaced names, trims pace/platform values, adds reference tables with foreign keys, and includes RLS/client-grant restrictions. Review SQL before application.

### Verification reported

`node --test api/test/metadata.test.ts` passed **1/1**. No live migration or post-migration query verification occurred.

### Critical pending work

- **Wishlist creation/import compatibility:** removing automatic vocabulary insertion can silently drop unknown Steam tags. Normalize Steam/manual wishlist creation against controlled catalogs or explicitly support trusted importer vocabulary extension. Inspect `api/src/wishlist.ts`, `api/src/wishlist-repository.ts`, `api/src/steam-mapping.ts`, and manual wishlist form inputs. Do not deploy with silent tag loss.
- **Apply migration before deployment:** `PgGameRepository.metadataCatalog()` now queries reference tables that do not exist in the live database yet.
- Create the timestamped Supabase migration mirror of `db/migrations/016_controlled_metadata.sql`. There is currently no matching new file under `supabase/migrations/`.
- Root started `npx --yes supabase migration new --help` because no installed CLI was found. The user interrupted the tool call before its output was received; its final outcome/session status is unknown. It did not report generating a migration or applying SQL. Check for a leftover npm/Supabase process before repeating.
- Run formatting, lint, typecheck, full tests, and migration checks.
- Decide whether the two metadata helper scripts should remain as reusable tools or be removed.
- Store SVGs are configured locally; fetching official store SVG assets from the network was not completed.

## Continuation order

1. Read this handoff, inspect the current diff, and preserve unrelated preexisting changes. Do not restore the removed harness.
2. Fix the wishlist/import controlled-catalog compatibility issue before migration or deployment.
3. Review the prepared SQL and create the timestamped Supabase mirror using the available project migration method. Apply to the authorized database and verify resulting catalog/FK behavior and preservation of existing metadata. Keep credentials out of output.
4. Finish queue metadata icons/configuration and resolve obsolete `inProgress` UI semantics.
5. Verify the new database search and predecessor validation. Check for SQL escaping mistakes with real queries.
6. Update obsolete queue snapshot/count tests after confirming the new semantics; investigate the static HTML failure.
7. Run integrated typecheck, lint, tests, formatting checks, and build, then browser checks for mobile/desktop menus, game details, controller behavior, parallel games, date display, and list controls.
8. Review the combined implementation with another subagent if useful. No independent final review has been done yet.

Useful existing commands (PowerShell environment may need Node added to `Path`):

```powershell
$env:Path = 'C:\Program Files\nodejs;' + $env:Path
npm run typecheck
npm run lint
npm test
npm run build
& 'C:/Program Files/nodejs/node.exe' --test api/test/scoring.test.ts api/test/service.test.ts api/test/settings.test.ts api/test/metadata.test.ts
```

Live PostgreSQL integration tests are in `api/test/pg.test.ts`; they are skipped without `DATABASE_URL`. They create and clean up a temporary app user. Review them and the current migration state before running with environment files.

## Environment notes

- The sandbox repeatedly failed to initialize commands with `helper_unknown_error: setup refresh had errors`. Read-only and necessary command runs succeeded after requesting `sandbox_permissions: "require_escalated"`. `apply_patch` worked for repository edits.
- The Browser skill was read in preparation for UI validation, but the browser runtime was **not initialized**, no browser session was bound, and no browser checks were performed.
- No application dependency changes were intentionally made for this feature. The interrupted `npx` CLI command may have populated npm's cache; inspect if needed.
- All subagents were told to stop implementation for this handoff. Metadata agent confirmed no running commands and no applied migration.
