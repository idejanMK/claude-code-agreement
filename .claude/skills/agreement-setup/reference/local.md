# Local — what lives in each project

Nothing is installed into a project by `/agreement-setup`. A project gets its files from
`/new-project` (fresh folder) or `/new-project adopt` (existing repo, adds only what is missing):

| File | Role | Shape and upkeep |
|---|---|---|
| `CLAUDE.md` | Project facts only: profile (FULL or LIGHT), what, stack, commands, where things are, quirks. Under 40 lines. | the agreement, "This file wins" |
| `PLAN.md` | Dashboard: branch, now, your turn, blocked on, the open phase. | `rules/records.md` |
| `ROADMAP.md` | Milestones, decisions, backlog, gotchas. | `rules/records.md` |
| `NOTES.md` | The only inbox. | `rules/records.md` |
| `records/notes-log.md`, `records/phases/<n>.<k>.md` | Triaged notes; one file per phase. | `rules/records.md` |
| `records/spec/` | The user's spec documents, as given. Read, never edited. | — |
| `FEATURES.md`, `demos/` | FULL profile only. | `rules/records.md` |
| `project-accounting.json` | Cost ledger; its presence turns accounting on. | `accounting.md` |
| `.scratch/` | Test output; ignored by git; emptied at phase close. | `rules/records.md` |
| `.gitignore` additions | `HANDOFF.md`, `.scratch/`, `project-accounting.html`. | `templates/records/gitignore-additions.txt` |

`HANDOFF.md` is written by the context-handoff hook when a session should be restarted; it is
session state, not a record, and is ignored by git.
