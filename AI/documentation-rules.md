---
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

| `type`        | Answers                      | Style                                   |
| ------------- | ---------------------------- | --------------------------------------- |
| `hub`         | Where do I find X?           | Links with one-line descriptions        |
| `how-to`      | How do I do X?               | Numbered steps ending in a check        |
| `reference`   | What is X exactly?           | Tables and facts, no teaching           |
| `explanation` | Why is it this way?          | Short prose with the trade-off          |
| `decision`    | What did we choose, and why? | Context, decision, consequences, status |

A note of one type does not teach in another. Put the explanation of a how-to in its own `explanation` note and link it.

## Linking

- Use Obsidian wikilinks with the path from the repository root, without `.md`: `[[AI/backend/infrastructure]]`.
- Link to code with a plain path in backticks: `apps/api/src/setup.ts`.
- Every note is linked from at least one hub or sibling (no orphans) and ends with `## Related` linking at least one other note.
- Link to a fact's source instead of copying it.

## New note template

```markdown
---
type: how-to
area: backend
---

# Title in the form of the question it answers

Body.

## Related

- [[AI/backend/backend]]
```

After creating a note, add it to the hub of its area.

## Language

Notes, identifiers and code comments are in precise English (see `AGENTS.md`).

## Related

- [[AI/index]]
- [[AI/decisions/0001-monorepo-and-stack]]
