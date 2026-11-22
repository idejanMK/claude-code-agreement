# ROADMAP — claude-code-agreement

Cold record: milestones, phases, decisions, backlog, gotchas. Append-only; every list newest first.
Grammar: `~/.claude/rules/records.md`. Hot state: `PLAN.md`. The open phase: `records/phases/`.

## Milestones

| ID | Name | Status |
|---|---|---|
| M1 | Installable package | open |

## M1 — Installable package

Anyone (the owner on a new machine, or a stranger from GitHub) installs the whole agreement system with
one skill, starts or adopts a project with records and cost accounting working from the first session,
and can check that the install is exact.

| Phase | Name | Status | File |
|---|---|---|---|
| 1.1 | Installable package | open 2026-11-22 | [1.1](records/phases/1.1.md) |

## Decisions

### Index by topic
- **Process and scope:** D1, D3, D5, D7
- **Install and check:** D2, D4, D6, D8
- **Records and housekeeping:** D9, D10, D12
- **Privacy:** D11

### Log (newest first)

#### D12 — Onboarding: new-project scaffolds, interview plans; the spec lives in `records/spec/`
2026-11-22 — `/new-project` asks for the spec (files, a folder, typed sentences, or nothing), files it
under `records/spec/` (input: read, never edited by us), invents no milestone or phase, and ends by
starting `/interview`, which proposes the milestones and phase 1.1 from the spec. Adopt mode feeds the
existing README in. The templates lose the "First behaviour" phase and the first-milestone
placeholder. The owner: "should not ask for a first milestone; should ask for spec docs". Replaces
the first-milestone question in premise 5.

#### D11 — Cost rows stop recording the local folder path
2026-11-22 — Every row in `project-accounting.json` carries `cwd`, the full local path (it includes the
Windows username). Projects commit that file, so a public repo publishes it. New rows drop the path;
old rows stay. Decided by the orchestrator as a privacy invariant; logged, not asked.

#### D10 — Housekeeping: one `.scratch/` folder, emptied at phase close
2026-11-22 — Test output (screenshots, traces, logs) goes to `.scratch/` per project, ignored by git.
A file worth keeping moves to `demos/<phase>/` and is linked from the demo or phase file. `/close-phase`
empties `.scratch/`; the boot brief shows its size. Raised by the owner; premise 6, agreed.

#### D9 — One home for record formats
2026-11-22 — `rules/records.md` defines the shape of every record file and who keeps it up to date,
when — now including demos and the accounting file. Templates carry a one-line pointer; the setup's
reference files point to it and never copy it. Premise 4, agreed.

#### D8 — Settings are merged, clashes are asked
2026-11-22 — Setup adds only the package's own settings entries and never removes or edits others.
A key holding a different value, or a same-named file that differs, is shown and asked (keep theirs ·
take ours · stop). Check looks only at the package's entries. Premises 2 and 3, agreed.

#### D7 — What ships, what stays out
2026-11-22 — Ships: the agreement, the 10 hooks plus cost-html, 4 agents, the records rules, the 5
procedure skills, the records mod, the record templates (with FEATURES, demos, accounting, gitignore
lines), agreement-setup, a rewritten new-project. Out, deliberately: plugin packaging (D2), stack
variants (the owner: "make it as general as possible"), the board, deploy and VPS pieces (tied to the
owner's accounts; stay private, B1), the Windows beeps, auto-update (update = git pull + setup), an
uninstall mode (README lists the files; B2), third-party skills, migrating old-grammar projects.
Premises 1 and 8, agreed.

#### D6 — Package layout: `package/` mirrors `~/.claude`
2026-11-22 — Installable files live under `package/`, shaped like `~/.claude`. The repo root is the
project: README, LICENSE, a short project CLAUDE.md, the records. `/agreement-setup` is a project skill
in `.claude/skills/`, so cloning and opening Claude in the folder is enough to run it. Fixes the root
CLAUDE.md being the agreement itself, which loaded it twice per session. Orchestrator's call.

#### D5 — This repo: LIGHT profile, default branch `main`
2026-11-22 — LIGHT: no money logic, one user, a process package. `master` is renamed to `main`, the
standard (the owner: "use whatever is standard"). Premise 11, agreed.

#### D4 — agreement-setup is written steps plus one Node script
2026-11-22 — The skill does the talking; one script, driven by a file list, has three modes: plan,
apply, check. Check compares content with line endings ignored, plus the package's settings entries.
Chosen over steps only, because "exact" must be a mechanical result, not Claude's opinion. Rejected:
symlinks (a half-built branch runs live; Windows needs admin), a bash script (Windows), versioned
releases (over-built now).

#### D3 — This repo is the one source
2026-11-22 — The package is changed here on a branch, merged, then installed into `~/.claude` with
`/agreement-setup`; check reports drift. The starter kit's template copy is deleted. Chosen over
`~/.claude` as source with an export script: the public history stays reviewed branches, and a missed
allowlist entry cannot leak. The diff on the day found no content drift between the three copies.

#### D2 — Install with a plain setup skill, not a plugin
2026-11-22 — Docs (code.claude.com, checked 2026-11-22): a plugin carries skills, agents, hooks and
output styles, but not the global CLAUDE.md, rules, statusLine, env or any settings key, and it
prefixes skill and agent names. A plugin would cover half the package and break the names the
agreement uses. One mechanism covers all of it.

#### D1 — This repo's own records are public
2026-11-22 — PLAN, ROADMAP, NOTES and `records/` live in this public repo with everything else (the
owner: "make them part of the repo as everything else"). They get the same privacy sweep as shipped
files: no names, paths, emails or server details.

## Backlog

Later, not scheduled. `- B<n> (date) text`; built → `→ <id>`, dropped → `✗ reason`. Newest first.

- B4 (2026-11-22) Revisit plugin packaging if plugins gain rules, statusLine or settings support.
- B3 (2026-11-22) Ship a generic headless-browser verify skill: the agreement says "drive the real flow
  in the headless browser" but the package ships none.
- B2 (2026-11-22) Uninstall mode reading the same file list as check.
- B1 (2026-11-22) Optional board add-on: generalise board-sync and board-contract (owner and project
  as settings), off by default.

## Gotchas

### Packaging
- Content compares must ignore line endings: a Windows clone has CRLF where the repo has LF.
- A Claude Code plugin cannot ship CLAUDE.md, rules, statusLine, env or settings keys (D2).
