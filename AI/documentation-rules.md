---
name: documentation-rules
description: When to edit or create an AI note, note types, frontmatter and linking rules.
type: reference
area: root
---

# Documentation rules

Notes are written for agents and humans. They hold knowledge the code and config cannot show: conventions, reasons, gotchas, recipes. Never restate what `package.json`, a config file or the directory listing already says.

## Edit or create: one test

Each note answers one question, in one note type. Before writing, search `AI/` for your topic (`grep -ril "<term>" AI`).

1. A note already answers the same question: **edit it** (extend, correct or delete lines).
2. Your knowledge answers a different question, or has a different type: **create a new note**.
3. A note passes 150 lines, or mixes two types: **split it**. Move the part to a new note and leave a link where it was.
4. Two notes answer the same question: **merge** them into the better one and delete the other.
5. A decision changes: never rewrite its note. Create a new decision note that supersedes it, and set the old status to `superseded`.

## Note types

| `type`        | Answers                         | Style                                   |
| ------------- | ------------------------------- | --------------------------------------- |
| `hub`         | Where do I find X?              | Links with one-line descriptions        |
| `how-to`      | How do I do X?                  | Numbered steps ending in a check        |
| `reference`   | What is X exactly?              | Tables and facts, no teaching           |
| `explanation` | Why is it this way?             | Short prose with the trade-off          |
| `decision`    | What did we choose, and why?    | Context, decision, consequences, status |
| `memory`      | What is the state of a session? | Append-only entries, see below          |

A note of one type does not teach in another. Put the explanation of a how-to in its own `explanation` note and link it.

## Progressive disclosure

An agent reads `AI/index.md`, then one area hub, then one note. Nothing else is loaded unless the task needs it.

- A hub holds a map and a `## Where to go` list. It never holds how-to steps.
- A note holds only what its `description` promises. Anything more goes in a new note linked from it.
- Never put a file in the repository root to hold knowledge. Reports and results belong in your final message (see `AGENTS.md`).

## Frontmatter

Every note starts with four keys:

- `name`: the file name without `.md`.
- `description`: one line that says what the note answers. An agent uses it to decide to open the note.
- `type`: a type from the table above.
- `area`: the area of the note.

Decisions add `status` and `date`. Session memory notes add the keys in "Session memory notes" below.

## Linking

- Use Obsidian wikilinks with the path from the repository root, without `.md`: `[[AI/backend/infrastructure]]`.
- Link to code with a plain path in backticks: `apps/api/src/main/setup.ts`.
- Every link carries a short description after a colon: `- [[AI/backend/backend]]: request flow and the map of backend notes.` Reuse the target's `description`.
- Every note is linked from at least one hub or sibling (no orphans) and ends with `## Related` linking at least one other note.
- Link to a fact's source instead of copying it.

## New note template

```markdown
---
name: adding-a-route
description: Steps to add an HTTP route to the API.
type: how-to
area: backend
---

# Title in the form of the question it answers

Body.

## Related

- [[AI/backend/backend]]: request flow and the map of backend notes.: Request flow of apps/api and the map of backend notes.
```

After creating a note, add it to the hub of its area.

## Session memory notes

Files in `AI/memory/<session>/` have `type: memory` and follow [[AI/memory/session-format]].

- They do not follow the "edit an existing note" test. Each writer appends to its own file.
- An append-only log can pass 150 lines. `state.md` stays at 60 lines or less.
- They need the frontmatter keys `name`, `description`, `type: memory`, `area`, `session`, `agent` and `status` (`active` or `compacted`).
- They need described links and a link from the session `index.md`. `state.md` and append-only files put a `Related:` line under the title.

## Language

Notes, identifiers and code comments are in precise English (see `AGENTS.md`).
All notes follow the ASD-STE100 supreme rule in `AGENTS.md`: short sentences, one idea per sentence, active voice.

## Related

- [[AI/index]]: Entry point: pick the area you change and follow one link.
- [[AI/decisions/0001-monorepo-and-stack]]: Why the repo is a pnpm monorepo with this stack.
