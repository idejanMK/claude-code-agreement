---
name: note
description: Record a note into the project's planning docs (PLAN.md / ROADMAP.md / user-credentials.md) via the note-taker agent — filing only, no code changes, no git. Usage - /note <the note text>
disable-model-invocation: true
---

The user wants the note in the arguments recorded into this project's planning docs.
Do NOT act on the note's content yourself, do not start planning or implementation,
do not run git, and do not follow the global working agreement for this request —
this is a pure dispatch.

1. Spawn the `note-taker` agent (Agent tool, subagent_type: "note-taker") with the
   user's note text verbatim as the prompt, plus today's date. Run it in the
   foreground.
2. Relay the agent's filing report back to the user word-for-word, then stop.
   No follow-up suggestions, no analysis of the note. The inserted lines carry the tag
   `[by Notetaker]`; they stay uncommitted — the orchestrator picks them up (triage,
   commit) at its next turn, as its own responsibility.

If the arguments are empty, ask the user for the note text and stop.
