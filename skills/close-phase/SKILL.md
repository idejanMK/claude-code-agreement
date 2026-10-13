---
name: close-phase
description: Close the open phase - confirm every verify line was checked once (gate 2), run the full gate once, write the Closure section (lines, gate, cost, retro), promote keepers and features, close the ROADMAP row, reseed PLAN.md, commit, then propose the --no-ff merge. Usage - /close-phase
disable-model-invocation: true
---

# /close-phase — the open phase becomes a closed, frozen record

Records grammar: `~/.claude/rules/records.md`. The phase file named by PLAN.md's Open phase is
the one being closed.

## Gate (stop and report what is missing; never close around it)
1. Every task is `✅ verified <date> by <who>` or `✗ dropped — reason`. Every verify line has an
   Evidence entry naming who checked it and how. A line nobody walked is listed for the user with
   the steps; the skill stops there.
2. The full gate (lint + typecheck + whole suite, the project's own command) has run once in this
   session, green, after the last code change. Not per task, not twice.
3. FULL profile: `demos/<id>-demo.md` exists and is committed.
4. Cost: sum the rows in `project-accounting.json` whose `branches` include the phase branch →
   `~$X (N sessions)`. Never a hand-written figure; if the file is absent, write `not tracked`.

## Steps
1. `## Closure` in the phase file: one line per verify line (met / not met / dropped, who, how), the
   gate command and its result, the cost line, and **Retro:** one paragraph. A pain that repeated
   gets its fix now: a gotcha, a memory, or a line in the agreement (the last one is the user's call).
2. Keepers → ROADMAP `## Gotchas` under their topic. Dropped behaviours → a `#### D<n>` entry.
   FULL: each verified line → `FEATURES.md` as the next `F<n>`.
3. Status → `closed <date>`. From here the file is frozen; the write guard refuses edits.
4. ROADMAP: the phase row → `closed <date> · cost` with the file link; the milestone row if it was
   the last phase.
5. PLAN.md: Open phase → `none`, previous phase → this file; At a glance → Now: `<id> closed; next:
   <the next proposed phase or "pick one">`, Your turn: the merge.
6. `node ~/.claude/hooks/records-lint.js` must pass.
7. One commit `docs(<id>): close phase — <title> (cost ~$X, N sessions)`; push the branch.
8. Propose, do not run: `git checkout main && git merge --no-ff <branch> && git push && git branch -d
   <branch>` (rebase first if main moved; CI green where CI exists).

## Report
`🏁 <id>: <title> — closed`, the Closure link, each verify line's verdict in one line, the cost, and
the merge command on the last line.
