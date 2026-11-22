---
paths:
  - "PLAN.md"
  - "ROADMAP.md"
  - "NOTES.md"
  - "FEATURES.md"
  - "records/**"
  - "demos/**"
  - "project-accounting.json"
---

# Records — the grammar (loads when a record is touched)

Master templates: `~/.claude/templates/records/`. Lint:
`node ~/.claude/hooks/records-lint.js [project root]` (also runs after every edit to a record and
reports what is off). Every record file below says **who keeps it, when**; nothing else writes it.

## IDs and the six rules

| Level | ID | Home | Example |
|---|---|---|---|
| Milestone | `M<n>` | ROADMAP.md, `## M<n> — <name>` with its phase table | `M1` |
| Phase | `<n>.<k>` | `records/phases/<n>.<k>.md`, proposal to closure | `1.2` |
| Task | `<n>.<k>.<t>` | `### <n>.<k>.<t> — <title>` inside its phase file | `1.2.3` |
| Decision | `D<n>` | ROADMAP.md → Decisions → Log, `#### D<n> — <title>` | `D4` |
| Backlog item | `B<n>` | ROADMAP.md → Backlog, `- B<n> (date) …` | `B7` |
| Note | `N<n>` | NOTES.md until triaged, then `records/notes-log.md` with its outcome | `N12 → 1.2.4` |
| Feature | `F<n>` | FEATURES.md (FULL only), `- F<n> …` | `F3` |

1. **Next free number, appended at the end.** Never renumber, never reuse, never insert between.
   A number is identity; order lives in the Now / Next / Later tables.
2. **One home per ID.** Every other place links to it: `[1.2.3](records/phases/1.2.md#L40)`.
3. **A phase file is created when the phase is proposed and never deleted.** Its Status changes in
   place: `proposed` → `open since <date>` → `closed <date>`, or `dropped — <reason>`. A closed file
   is frozen (the write guard refuses edits). A Later row in ROADMAP may exist without a file.
4. **Dropping is a status with a reason**, never a deletion. Dropped behaviour is a decision.
5. **Every ask to the user names an ID and links its home line**, with the verify line quoted.
6. **Content moves, never vanishes.** Restructuring moves text between homes; it never loses it.

## The files and their fixed shapes

**PLAN.md — a dashboard, ≤ 30 lines, no task text.** Headings exactly: `# PLAN — <project>` ·
`## At a glance` (four bullets: **Branch**, **Now**, **Your turn**, **Blocked on**; overwritten, never a
log) · `## Open phase` (`- **Phase file:** [<id> — <title>](records/phases/<id>.md)` or `none`, plus
the next proposed phase and the previous closed one as links). Nothing else.
*Kept by:* the orchestrator — At a glance after every task status change; Open phase by `/interview`,
`/open-phase` and `/close-phase`. The boot brief prints it; the user never edits it.

**records/phases/<n>.<k>.md — the phase.** `# <n>.<k> — <title>` · header bullets **Milestone**,
**Status**, **Branch**, **Gate 1** (verify lines approved <date> by <who>, or `awaiting`) · `## Why` ·
`## Scope` (what changes, what does not) · `## Tasks` (table: ID · What · Status · Checked by) ·
`## Task details` (one `### <id> — <title>` per task, newest first, same order as the table; a subtask
is `#### <id>.<s>` under its parent) · `## Context` (decisions that bind these tasks, facts every task
needs) · `## Open user items` · `## Closure` (filled by `/close-phase`: each verify line met / not met
and by whom, the gate run, cost, retro). Every task carries exactly these fields, in this order, each
present (`—` when empty): **Status** (todo · building · built · ✅ verified <date> by <who> · ✗ dropped —
reason) · **Why** (≤ 2 lines) · **Scope** · **Verify** (numbered lines + `Approved: <date>` or `—`) ·
**Your part** (the user's steps, or `—`) · **Evidence** (per verify line: met / not met, who, how; later
runs as dated sub-bullets) · **Keepers** · **Deps**. No other field names. Anything longer goes to the
commit message or to ROADMAP.
*Kept by:* `/interview` creates it; the orchestrator updates a task's Status and Evidence as each task
is built and verified, in the same commit as the work; `/close-phase` fills Closure and freezes it.

**ROADMAP.md — cold, append-only, newest first in every list.** `## Milestones` (table: ID · Name ·
Status) · one `## M<n> — <name>` per milestone (a goal paragraph, then a phase table: Phase · Name ·
Status · File) · `## Decisions` (`### Index by topic`, then `### Log (newest first)` with
`#### D<n> — <title>` and a dated paragraph) · `## Backlog` (`- B<n> (date) text`; built or dropped
items keep their line with `→ <id>` or `✗ reason`) · `## Gotchas` (`### <topic>`, one bullet each).
A migrated project adds `## Legacy` pointing at `records/legacy-roadmap.md`, which is never edited.
*Kept by:* the orchestrator — a `D<n>` the moment a decision is made (gate 3 answers, corrected
premises, dropped behaviours), a `B<n>` when something is parked, a Gotcha at closure; phase rows by
`/interview`, `/open-phase`, `/close-phase`.

**NOTES.md — the only inbox.** `- N<n> (YYYY-MM-DD) <text> [by Notetaker]`, next free number, appended.
`/triage` moves each line to `records/notes-log.md` as `- N<n> (date) <text> → <outcome>` where the
outcome is a task ID, `B<n>`, `D<n>`, `? <question for the user>` (the note stays in NOTES until
answered) or `✗ <reason>`. The boot brief shows the untriaged count; untriaged notes are the
orchestrator's debt, not the user's.
*Kept by:* `/note` appends; `/triage` empties it, at the latest before a phase closes. The user may
type a line by hand in the same shape.

**records/notes-log.md — every triaged note**, newest first, one line each, in the `/triage` shape
above. *Kept by:* `/triage` only. Never edited afterwards.

**FEATURES.md (FULL only).** `# FEATURES — <project>`, then `- F<n> <one plain line per verified
behaviour>`; dropped: `- F<n> ✗ reason`. Append-only, next free number.
*Kept by:* `/close-phase` promotes the phase's verified lines and the deliberately-out lines, never
earlier. `/interview` reads it back to the user for "what must not break".

**demos/<n>.<k>-demo.md (FULL only) — the walk the user takes to accept a phase.** `# <n>.<k> — demo`
· one numbered step per verify line nobody has walked yet: what to do, what you should see, and a
link to the evidence (a screenshot or file under `demos/<n>.<k>/`). Nothing a script could check.
*Kept by:* `/close-phase` writes it once, commits it and sends it to the user; it is never updated
after the phase closes. Evidence files are moved in from `.scratch/` at the same time.

**project-accounting.json — the cost ledger (opt-in).** `{ "note", "sessions": [<one row per
session>], "total_est_usd" }`; a row has `session_id`, `date`, `active_hours`, `branches`, `turns`,
`tokens_total`, `est_usd`, per-model counts — and never a local path. Present in the project root =
accounting on; absent = off. Committed with the project.
*Kept by:* the Stop hook (`session-cost-stop.js`) only, after every reply. Nobody edits a figure by
hand; a wrong total is rebuilt with `node ~/.claude/hooks/session-cost-stop.js --backfill` from the
transcripts. `/close-phase` reads it to sum the phase's cost. `cost-html.js` renders it to
`project-accounting.html` beside it.

**.scratch/ — not a record.** Test output (screenshots, traces, logs) lands here and nowhere else;
ignored by git. A file worth keeping moves to `demos/<n>.<k>/` and gets linked. `/close-phase` empties
it. The boot brief shows its size when it holds anything.

## Procedures (skills; they load when they run)

- `/new-project` scaffolds these files from the templates (fresh folder, or `adopt` into an existing
  repo: adds only what is missing), then starts `/interview`.
- `/interview` shapes a phase: creates `records/phases/<id>.md` with Status `proposed`, tasks with
  draft Verify fields, and a ROADMAP phase row (and the milestone, when ROADMAP has none). No code
  until gate 1.
- `/open-phase <id>`: gate 1 is on record → Status `open since <date>`, branch
  `feature/<id>-<slug>`, PLAN's Open phase and At a glance, ROADMAP row, one `docs(<id>): open` commit, push.
- `/close-phase`: gate 2 on record for every verify line, the full gate run once → Closure section
  (lines, gate, cost, retro), keepers to Gotchas, FEATURES lines and the demo (FULL), ROADMAP row
  closed, PLAN reseeded, `.scratch/` emptied, one `docs(<id>): close` commit; then propose the
  `--no-ff` merge.
- `/triage`: empties NOTES.md into tasks, backlog, decisions or user questions, one commit.
