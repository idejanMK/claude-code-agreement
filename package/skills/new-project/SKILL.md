---
name: new-project
description: Scaffold the records and cost accounting of a project from the installed templates (~/.claude/templates/records), then hand over to /interview, which plans the first milestone and phase from the user's spec. Two modes - fresh (an empty folder; git init, first commit on main) and adopt (an existing repo; adds only what is missing, never edits an existing file without asking). No stack, no code. Use when the user says "new project", "start a project", "scaffold", "adopt this project", "/new-project" or "/new-project adopt".
---

# /new-project — records and accounting from the first session

Templates: `~/.claude/templates/records/`. Grammar: `~/.claude/rules/records.md`. This skill
writes records only; it never invents a milestone or a phase — `/interview` does that from the spec.
Ask one question at a time with AskUserQuestion.

## Mode

- `/new-project` → **fresh**: the current folder is empty, or the user names a folder to create.
- `/new-project adopt` → **adopt**: the current folder is an existing project (code, maybe a
  README, maybe a CLAUDE.md). If the folder has files and no mode was given, ask which.

## Steps

1. **Name and folder.** Fresh: ask the project name; the folder is the current one if empty, else
   `./<name>`. Stop if the target exists and is not empty. Adopt: the name is the folder's name
   unless the user says otherwise.
2. **Profile.** FULL if any of: money/ledger logic · more than one tenant on one database · planned
   life over a month. Otherwise LIGHT. Record the trigger in one clause.
3. **The spec.** Ask for it, one question, three answers: files or a folder (copied, unchanged, into
   `records/spec/`), a few typed sentences (saved as `records/spec/brief.md`), or nothing (fine:
   `/interview` will ask). Adopt: also name the existing README as input for the interview; never
   move or edit it. From the spec or the README, draft the one-sentence **What** for CLAUDE.md and
   show it; the user corrects it.
4. **Copy what is missing.** From the templates: `PLAN.md`, `ROADMAP.md`, `NOTES.md`,
   `records/notes-log.md`, `project-accounting.json`; FULL only: `FEATURES.md`, `demos/README.md`.
   Not copied: `records/phases/1.1.md` (the phase template `/interview` uses) and
   `gitignore-additions.txt` (appended to `.gitignore`, created if absent; each line only if not
   already there). Adopt: a file that already exists is skipped and listed, never replaced.
5. **CLAUDE.md.** Fresh: copy the template. Adopt with an existing CLAUDE.md: show the two lines to
   add — `**Profile:** <FULL|LIGHT> — trigger: …` and `Records: PLAN.md · ROADMAP.md · NOTES.md ·
   records/ (grammar ~/.claude/rules/records.md)` — and append them only after the user says yes.
6. **Fill every placeholder** in every copied file: `{{PROJECT_NAME}}`, `{{DATE}}` (today,
   YYYY-MM-DD), `{{PROFILE}}`, `{{PROFILE_TRIGGER}}`, `{{WHAT}}`. Then
   `grep -rn "{{" <the copied files>` must find nothing.
7. **Lint.** `node ~/.claude/hooks/records-lint.js .` must print `records: ok`.
8. **Git.** Fresh: `git init -b main`, `git add -A`, commit `chore: scaffold records and accounting`.
   No remote yet; say how to add one. Adopt: one commit `docs: add records and cost accounting` with
   only the files this skill added or appended, on the current branch if it is not `main`, else on
   a new `docs/records` branch (main is protected by the agreement).
9. **Hand over.** Say what landed and that accounting is now on (the first cost row appears after
   the next reply). Then start `/interview` in the same turn, pointing it at `records/spec/` (and
   the README in adopt mode). It proposes the milestones and phase 1.1; building waits for gate 1.

A second run on the same folder adds nothing: every file exists, every placeholder is filled, and
the skill says so.

## Report back

Mode, folder, profile + trigger, the files added (and, in adopt, the files skipped), the commit,
and the line "Next: /interview is running".
