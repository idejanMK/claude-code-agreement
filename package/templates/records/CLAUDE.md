# {{PROJECT_NAME}}

<!-- Project facts only, under 40 lines (agreement: "A project CLAUDE.md holds project facts only"). -->

**Profile:** {{PROFILE}} — trigger: {{PROFILE_TRIGGER}} (FULL if any of: money/ledger logic, more
than one tenant on one database, planned life over a month).

**What:** {{WHAT}}

**Stack:** one line: languages, framework, database, hosting.

**Commands:** dev · test · lint · typecheck · migrate (the exact commands, one line).

## Where things are (read on demand, not at boot)

| Need | Read |
|---|---|
| the spec, as the user gave it | `records/spec/` (read, never edited) |
| the open phase, its tasks and verify lines | the file PLAN.md's "Phase file" line names |
| what is next, whose turn it is | PLAN.md (the boot brief already shows it) |
| why we decided something | ROADMAP.md → Decisions |
| what is parked for later | ROADMAP.md → Backlog |
| a durable surprise about this codebase | ROADMAP.md → Gotchas |
| the user's untriaged notes | NOTES.md |
| how to open, close or triage | `/open-phase`, `/close-phase`, `/triage` |

## Quirks

(things a fresh session must know that the code does not say; keep this file under 40 lines)
