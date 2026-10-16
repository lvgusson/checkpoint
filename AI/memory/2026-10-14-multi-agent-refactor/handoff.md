---
name: handoff
description: Recovery instructions for completing the owner-authorized session after Codex stops.
type: memory
area: memory
session: 2026-10-14-multi-agent-refactor
agent: orchestrator
status: active
---

# Continue here

Related: [[AI/memory/2026-10-14-multi-agent-refactor/index]]: Session hub.

## Owner authorization

- The owner asks Codex to continue Claude's work and act as orchestrator.
- Finish all pending features, security corrections, documentation, summary, commit and push.
- The owner explicitly authorizes commit and push in this conversation.
- The owner approves a purchase bonus of 10 points, declining linearly to zero after 30 days.
- The bonus weight remains adjustable.
- The owner requests parallel subagents and specifically asks Agy to use subagents.
- After skills repair, Agy reviews all Markdown against ASD-STE100.
- Preserve original third-party skill files. Report their language deviations without rewriting them.

## Verified recovery facts

- Branch: main. Starting HEAD: 1b3389c. Origin is github.com/lvgusson/checkpoint.
- Many uncommitted changes predate this handoff. Preserve them and review the complete diff.
- Backend reorganization checkpoint-4xa is incomplete. New paths compile before feature integration.
- Old Claude worker is no longer visible in tmux. Codex assumes its integration responsibilities.
- Tmux panes renumbered: Codex is pane 0; Agy is pane 1. Inspect before sending prompts.
- Access workers only through .agents/pane.sh. Its pane number argument still works after renumbering.
- Agy completes checkpoint-2m2. Its marker appears wrapped across lines.
- Independent validation finds 12 skill folders and 12 matching lock entries.
- All 12 SKILL.md headers parse. Names and Claude aliases match. Skill bodies equal Git HEAD bytes.
- Root skills/ is removed. Prettier ignores vendored skills.
- One retained script differs: diagnosing-bugs/scripts/hitl-loop.template.sh. Check its executable mode.
- checkpoint-418 duplicates checkpoint-2m2. Close the duplicate only after final validation.

## Current parallel workers

- config_feature: checkpoint-9md. Implements metadata management, existing seven DB tables, admin add/delete unused options.
- Config uses no new migration. It avoids a redundant config_option table and preserves public auth config.
- Config tests pass 5/5. Current command: `pnpm test apps/api/test/config.test.ts`. Web tsc passes.
- Security_finish: checkpoint-0bn. Owns auth limiter, Steam client, logs, request guards, PG pins, security tests and migration017.
- Purchase_feature: checkpoint-3r7 and checkpoint-2vy. Owns purchase, recency, sorting, models, game/wishlist services and routes, UI, migration019.
- Purchase source edits are reported complete. Tests need final integration.
- Root fixes the removed metadataCatalog import in services/games.ts before writing this handoff.
- Workers must not commit or push. The orchestrator reviews and publishes.
- Original audit reports remain in the scratchpad path below.

## Integration still required

1. Read current files before editing. Workers can still apply final fixes.
2. Integrate ConfigRepository and ConfigService into main/data.ts, main/setup.ts, main/server.ts and API index.mjs.
3. Export or directly import new config drivers. GAMES_STORE selects matching config storage.
4. Config constructors: PgConfigDriver(sql), JsonConfigDriver(path,gamesDriver,owner='local').
5. ConfigRepositoryImpl(driver) supplies the third GameRepositoryImpl constructor argument.
6. ConfigService(data.config) becomes setup.config. makeServer receives optional fifth config argument.
7. Route configRoute after auth. Keep /api/v1/config public auth fields unchanged.
8. Call assertPrivateStores(kind, Boolean(env.SUPABASE_URL)) after store selection in main/data.ts.
9. Central server uses socket.remoteAddress for auth limiter. Ignore unverified X-Forwarded-For.
10. Guard expensive requests through shared/request-guard.ts. Reorder has route-local admission until background completion.
11. Recommendations reject libraries above 2000 games. Wishlist import rejects above 1000 app IDs.
12. Complete inward dependency ESLint rules. Update all moved entrypoints and stale paths.
13. Wire validation carefully. New schemas differ from current defaults, ranges and calendar-date checks.
14. Fix remaining audit bugs: lost PATCH updates, partial wishlist creation, concurrent wishlist creation, reused private fields.
15. Verify SafeSink, country/currency handling, release recording missing-table fallback and safe integer versions.
16. Remove the inactive inProgress factor only with coordinated contract/UI compatibility.
17. Update OpenAPI for config operations, purchase and sorting.
18. Update AI notes and README after implementation stabilizes.
19. Fix seed compatibility issue checkpoint-1ar without rewriting historical migrations.
20. Add CI and complete env template if confirmed by the consolidated audit scope.

## Local database verification

- A disposable PostgreSQL18 server runs on 127.0.0.1:54329. No live database changes are authorized or required.
- Bundled binaries and scripts are under the scratchpad pg/ folder.
- Existing build-template.sh masks errors. Do not rely on it without strict error checks.
- Existing seed must load before controlled-metadata migration until the seed issue is fixed.
- Security helper requires SECURITY_TEST_DATABASE_URL and database name prefix checkpoint_security_.
- Create a fresh isolated database. Apply migrations017 and019 before testing new code.
- Use its local database URL only in each test process. Never read or print production credentials.

## Validation and publication

- Run pnpm install after manifest changes.
- Run focused Vitest suites, real local PostgreSQL ownership checks and browser tests.
- Run pnpm check. It must pass before publication.
- Review with Ponytail review and Matt code-review. Use a different model for independent review where available.
- Review every staged file. Exclude credentials, logs, databases, scratch files and generated browser output.
- Write the requested final summary under this session folder and link it from the hub.
- Update Beads with evidence. Do not close unverified work.
- Commit the reviewed changes and push main. No force push.
- If a permission or remote error blocks publication, report the exact failure.
- Git metadata may be read-only in Codex sandbox. Do not claim commit/push without successful commands.

## Sources

- Scratchpad: /tmp/claude-1000/-home-lucas-projects-checkpoint/077da26d-80fa-4a6f-b654-fc81f9068459/scratchpad/
- codex-findings.txt: security S1-S5 and supporting evidence.
- ponytail-back.txt: 15 backend findings with memory-only reproductions.
- codex-prune.txt and ponytail-rest.txt: pruning, configs and documentation findings.
- agy-skills.txt: original mechanical skills-repair assignment.
- Beads is authoritative for current issue status. Older state.md contains stale statuses.

## Skills invoked by Codex

- Ponytail: own installed ponytail/SKILL.md and ponytail-review/SKILL.md.
- Matt: writing-for-agents, tdd, codebase-design and code-review files.
- No Serena tools are available. Do not claim Serena use.
- Tests run during recovery: TypeScript noEmit passes before feature integration.
- Earlier audit assertions pass. They do not replace final regression tests.

## Latest recovery checks

- Agy received /tmp/agy-continuation-20261014.txt through pane.sh on pane1. The prompt requires subagents if its tools support them. No spawn is confirmed yet.
- API TypeScript passes after the games service uses MetadataCatalog as a type and reads the repository catalog.
- Combined config, purchase-wishlist and wishlist-sort tests pass: 10 tests, no failures.
- Security worker reports 17 local HTTP tests pass. Its startup-store regression stays red until main/data wires assertPrivateStores.
- Security worker owns isolated local database checkpoint_security_codex. It is restarting the scratch PostgreSQL server. Do not share that database.
- Purchase worker released its source files. Its issues remain open until integration and PostgreSQL checks pass.
