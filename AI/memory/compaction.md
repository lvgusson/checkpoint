---
name: compaction
description: Steps to merge log entries into the state note and close a session.
type: how-to
area: memory
---

# How do I compact session memory and close a session?

Only the orchestrator does these steps.

## Compact

Do this before `/compact` or `/clear`, after each worker finishes, and when `state.md` is older than about one hour of work.

1. Open `Sources compacted` in `state.md`. For each log, note the last compacted entry.
2. Read only the newer entries in each log that `index.md` links.
3. Append each new decision to `decisions.md` as `## D<n>`, with its reason.
4. Rewrite `state.md` from the template in [[AI/memory/session-format]]. Keep these items:
   - the next step and its blockers;
   - each work item with its bd id and status;
   - the open handoffs and questions, with a link to their entries;
   - the files changed in this session, grouped by work item;
   - the last `pnpm check`: the command, the exit code and the time;
   - one line for each decision, with a link to its `D<n>`.
5. Remove closed items from `state.md`. Their entries stay in the logs.
6. Update `Sources compacted`: one line for each log, with the last entry that you compacted and the log status.
7. If a log has a `done` entry and you compacted all its entries, set its frontmatter to `status: compacted`. Do not change its entries.
8. Set `updated:` in `state.md` to the current local time with the offset.
9. Keep `state.md` at 60 lines or less. Move detail to a link, not into the file.

Check: run the link check below. It must print `0 broken`.

```bash
python3 -c 'import re,pathlib as p;S=lambda t:re.sub(r"`[^`\n]*`","",re.sub(r"(?ms)^(`{3,}).*?^\1","",t));b=[(str(f),l) for f in p.Path("AI").rglob("*.md") for l in re.findall(r"\[\[([^\]|#]+)",S(f.read_text())) if not p.Path(l+".md").exists()];print(*b,len(b),"broken",sep="\n")'
```

## Close the session

1. Compact (above).
2. Promote durable lessons. A convention or a how-to goes into a normal `AI/` note. Use [[AI/documentation-rules]].
3. Put a short operational fact into `bd remember`. Put remaining work into `bd create`.
4. Write a final `state.md`: the result, the open bd ids and the promoted notes.
5. Set `status: compacted` in all files of the session folder.
6. Update the session line in [[AI/memory/memory]].
7. The owner decides when to delete a compacted session. To delete it, remove the folder and its line in the hub.

Check: no file in the folder has `status: active`, and the link check prints `0 broken`.

## Related

- [[AI/memory/memory]]: Hub of session memory: when to use it, the notes, the sessions.
- [[AI/memory/recall]]: Steps to recover the session state after a context clear or compaction.
- [[AI/memory/session-format]]: Layout, file types, frontmatter, naming, ownership, templates and the worker paragraph for a session memory folder.
