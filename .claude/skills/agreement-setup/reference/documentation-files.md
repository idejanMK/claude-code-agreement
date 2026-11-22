# Documentation files — the records

The shape of every record file, and who keeps it up to date and when, is defined in ONE place:
`rules/records.md` (installed to `~/.claude/rules/records.md`, loads whenever a record is touched).
This page only says what exists; it never repeats the rules.

| File | One line | Written by |
|---|---|---|
| `PLAN.md` | Dashboard, ≤ 30 lines. | the orchestrator, every task status change |
| `records/phases/<n>.<k>.md` | One file per phase: tasks, verify lines, evidence, closure. | `/interview`, the orchestrator per task, `/close-phase` |
| `ROADMAP.md` | Milestones, decisions, backlog, gotchas; append-only. | the orchestrator as decisions happen |
| `NOTES.md` | The only inbox. | `/note`, the user; emptied by `/triage` |
| `records/notes-log.md` | Every triaged note. | `/triage` |
| `FEATURES.md` (FULL) | One line per verified behaviour. | `/close-phase` |
| `demos/<n>.<k>-demo.md` (FULL) | The user's acceptance walk, with evidence. | `/close-phase` |
| `project-accounting.json` | Cost ledger. | the Stop hook only |

Templates: `templates/records/` (installed to `~/.claude/templates/records/`); each opens with a
pointer to its section of the rules. `/new-project` fills `{{PROJECT_NAME}}` and `{{DATE}}`;
`/interview` writes the first milestone and phase from the user's spec.
