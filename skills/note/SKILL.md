---
name: note
description: Record a note into the project's inbox (NOTES.md) via the note-taker agent — filing only, no code changes, no git. Usage - /note <the note text>
disable-model-invocation: true
---

The user wants the note in the arguments recorded into this project's inbox, `NOTES.md`.
Do not act on the note's content yourself, do not start planning or implementation,
do not run git, and do not follow the global working agreement for this request:
this is a pure dispatch.

1. Spawn the `note-taker` agent (Agent tool, subagent_type: "note-taker") with the
   user's note text verbatim as the prompt, plus today's date. Run it in the foreground.
2. Relay the agent's filing report back to the user word-for-word, then stop.
   No follow-up suggestions, no analysis of the note. The inserted lines carry the tag
   `[by Notetaker]` and stay uncommitted; the orchestrator triages them (`/triage`) and
   commits at its next turn, as its own responsibility.

If the arguments are empty, ask the user for the note text and stop.
