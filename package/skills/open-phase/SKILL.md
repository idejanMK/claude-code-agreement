---
name: open-phase
description: Open a proposed phase whose verify lines the user approved (gate 1) - set its status, cut its branch, point PLAN.md at it, update the ROADMAP row, commit and push. Usage - /open-phase <n>.<k>
disable-model-invocation: true
---

# /open-phase — a proposed phase becomes the open one

Records grammar: `~/.claude/rules/records.md`. One phase is open at a time.

## Preconditions (stop and report if any fails)
1. `records/phases/<id>.md` exists with `- **Status:** proposed` and a `- **Gate 1:** verify lines
   approved <date> by <who>` line. No approval on record → stop: gate 1 is the user's, not mine.
2. PLAN.md's Open phase is `none` (the previous phase is closed). Otherwise stop and name it.
3. The working tree is clean and on `main`, up to date with `origin/main`.

## Steps
1. In the phase file: Status → `open since <today>`, Branch → `feature/<id>-<slug>` (slug from the
   title, ≤ 4 words, kebab-case). Every task Status stays `todo`.
2. `git checkout -b feature/<id>-<slug>`.
3. PLAN.md: Open phase → the file link; At a glance → Branch, Now (`<id> open — first task <id>.1`),
   Your turn (`—` unless a task has a Your part), Blocked on (`—`).
4. ROADMAP.md: the phase row's Status → `open <date>`; the milestone's Status → `open` if it was not.
5. `node ~/.claude/hooks/records-lint.js` must pass.
6. One commit `docs(<id>): open phase — <title>`; push the branch (`git push -u origin <branch>`).

## Report
Branch, the phase file link, the first task ID with its verify line quoted, and the next command:
`Next: go <id>.1`.
