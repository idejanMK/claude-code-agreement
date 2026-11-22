---
paths:
  - "PLAN.md"
  - "ROADMAP.md"
  - "NOTES.md"
  - "records/**"
  - "FEATURES.md"
---

# Records — the grammar (loads when a record is touched)

Master templates: `D:\Code\My-projects\starter-template-ID\templates\records\`. Lint:
`node ~/.claude/hooks/records-lint.js [project root]` (also runs after every edit to a record and
reports what is off). The board hook reads the open phase file through PLAN's "Phase file" line.

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

**ROADMAP.md — cold, append-only, newest first in every list.** `## Milestones` (table: ID · Name ·
Status) · one `## M<n> — <name>` per milestone (a goal paragraph, then a phase table: Phase · Name ·
Status · File) · `## Decisions` (`### Index by topic`, then `### Log (newest first)` with
`#### D<n> — <title>` and a dated paragraph) · `## Backlog` (`- B<n> (date) text`; built or dropped
items keep their line with `→ <id>` or `✗ reason`) · `## Gotchas` (`### <topic>`, one bullet each).
A migrated project adds `## Legacy` pointing at `records/legacy-roadmap.md`, which is never edited.

**NOTES.md — the only inbox.** `- N<n> (YYYY-MM-DD) <text> [by Notetaker]`, next free number, appended.
`/triage` moves each line to `records/notes-log.md` as `- N<n> (date) <text> → <outcome>` where the
outcome is a task ID, `B<n>`, `D<n>`, `? <question for the user>` (the note stays in NOTES until
answered) or `✗ <reason>`. The boot brief shows the untriaged count; untriaged notes are the
orchestrator's debt, not the user's.

**FEATURES.md (FULL only).** `- F<n> <one plain line per verified behaviour>`; dropped: `- F<n> ✗ reason`.
Lines are promoted at closure from the phase file's verified lines, never earlier.

## Procedures (skills; they load when they run)

- `/interview` shapes a phase: creates `records/phases/<id>.md` with Status `proposed`, tasks with
  draft Verify fields, and a ROADMAP phase row. No code until gate 1.
- `/open-phase <id>`: gate 1 is on record → Status `open since <date>`, branch
  `feature/<id>-<slug>`, PLAN's Open phase and At a glance, ROADMAP row, one `docs(<id>): open` commit, push.
- `/close-phase`: gate 2 on record for every verify line, the full gate run once → Closure section
  (lines, gate, cost, retro), keepers to Gotchas, FEATURES lines (FULL), ROADMAP row closed, PLAN
  reseeded, one `docs(<id>): close` commit; then propose the `--no-ff` merge.
- `/triage`: empties NOTES.md into tasks, backlog, decisions or user questions, one commit.
