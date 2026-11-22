---
name: triage
description: Empty NOTES.md - every untriaged note becomes a task in the open phase, a backlog item, a decision, or a question for the user, and moves to records/notes-log.md with its outcome; one commit. Usage - /triage
disable-model-invocation: true
---

# /triage — the inbox goes to zero

Records grammar: `~/.claude/rules/records.md`. Notes are the user's words; the outcome is mine to
propose and theirs to overrule. Nothing is lost: every `N<n>` ends up in `records/notes-log.md`.

## For each note in NOTES.md, in order
Decide one outcome:
- **Task** — the note asks for a change inside the open phase's scope: append the next free task
  `### <id> — <title>` to the phase file (table + details, all eight fields, Status `todo`, Verify
  drafted from the note's words, `Approved: —`). Outcome `→ <task id> (verify line needs approval)`.
- **Backlog** — a change outside the open phase, or no phase is open: `- B<n> (date) <text>` in
  ROADMAP, next free number. Outcome `→ B<n>`.
- **Decision** — the note records something the user already decided ("we go with", "chosen"):
  `#### D<n> — <title>` in ROADMAP's log with the date and the why. Outcome `→ D<n>`.
- **Question** — the note needs the user's call before it can land anywhere: the line stays in
  NOTES.md prefixed `? ` and PLAN's Your turn names it with the link. Outcome `? <question>`.
- **Answered / dropped** — the note is already done, superseded, or declined (say why in one
  clause). Outcome `✗ <reason>` or `→ <the id that covers it>`.

A note that spans several things is split: `N<n>` keeps the first part; the rest get new numbers,
appended, with `(from N<n>)`.

## Then
1. Move each triaged line to `records/notes-log.md` as `- N<n> (date) <text> → <outcome>` (or `✗ …`).
   Only `? ` lines stay in NOTES.md.
2. `node ~/.claude/hooks/records-lint.js` must pass.
3. One commit `docs(notes): triage N<a>–N<b>` on the current branch (a `docs/notes` branch if on main;
   merge `--no-ff` and push).

## Report
One line per note: `N<n> → <outcome>`, then the open questions with their links, then
`Next: <the one command that moves the first question>`.
