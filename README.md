# claude-code-agreement

> **A hyper-lean operating protocol for human–AI software delivery.**  
> *Turn AI pair programming from chaotic diff-checking into disciplined, reality-verified product delivery.*

---

## The Problem

Most AI coding sessions degrade into the same failure modes:
- The AI writes sprawling, speculative code and asks you to review 500-line diffs.
- Test suites stay 100% green while live user paths silently break.
- Context windows fill up, the model forgets past decisions, and code rots across sessions.

## What This Is

**An opinionated, zero-slop operating protocol for building software with AI.** 

Instead of treating Claude as an over-eager intern that spews endless diffs and fake-green tests, this repository establishes a disciplined division of labor:

* **You (The Product Owner):** Own direction, define acceptance criteria upfront, and review observable user-facing behavior—never raw diffs.
* **Claude (The Staff Engineer):** Orchestrates implementation, enforces branch and task isolation, verifies against live reality, and keeps the record honest across restarts.

This repo pairs a foundational [`CLAUDE.md`](CLAUDE.md) working agreement with **lightweight, self-enforcing hooks** that track costs, prevent silent context degradation, brief each new session, guard against edits the user ruled out (read-only, a "let's talk" critique loop, a parallel session, a parked handoff), and display session vitals.

---

## Core Pillars

### 1. Three Human Gates (Everything else is automated)
- **Gate 1 (Upfront Acceptance):** Every task must have a plain-English `verify:` condition before code is written. Weak criteria ("make it work") are rejected.
- **Gate 2 (Phase Acceptance):** Checked once against reality (via headless browser, live server, or committed demo script). No double-checking.
- **Gate 3 (Decisions & Scope):** Trade-offs, new dependencies, and schema changes are escalated one at a time.

### 2. Testing Earns Its Place
A test is written only if it knows something the code does not:
1. Pure logic with complex branching (TDD).
2. Contracts from outside our head (documented external API shapes).
3. Regressions actually encountered in the wild.
*No presentation markup tests. No setter tests. No mock-heavy coverage theater.*

### 3. Living Memory (Markdown as the Source of Truth) — records v2
One grammar, one home per ID: milestone `M<n>` → phase `<n>.<k>` → task `<n>.<k>.<t>`, plus decisions
`D<n>`, backlog `B<n>`, notes `N<n>`, features `F<n>`. Next free number, never renumbered; order lives in
tables, not in numbers.
- `PLAN.md` — a fixed dashboard (At a glance + the link to the open phase). It cannot grow.
- `records/phases/<n>.<k>.md` — the phase's home from proposal to closure; frozen once closed.
- `ROADMAP.md` — milestones, decisions (`D<n>`), backlog (`B<n>`), gotchas. Append-only.
- `NOTES.md` — the only inbox (`/note` writes, `/triage` empties into `records/notes-log.md`).
- `FEATURES.md` — append-only ledger of verified behaviours (FULL profile).
- `HANDOFF.md` — auto-generated session state before context limits hit.

The grammar is a path-scoped rule (`rules/records.md`, loads only when a record is touched), the
templates are in `templates/records/`, and `hooks/records-lint.js` enforces the shape after every edit.
The procedures are skills: `/interview` shapes a phase, `/open-phase` opens it, `/close-phase` closes it,
`/triage` empties the inbox.

### 4. Glassy Chat Reporting
No narrative conversational filler. Every finished task hands back control in a scannable, standardized list:

```text
✓ Task 3: Email uniqueness check — done
• Finished: Rejects duplicate registrations with inline error.
• Evidence: test_duplicate_email passed (14ms); live curl verified 409 Conflict.
• Git: a1b2c3d feat(auth): reject duplicate emails · pushed to feature/auth-flow
• Next: Task 4: Password reset tokens — proceed?
```

---

## Repository Anatomy

```text
├── CLAUDE.md                     The core working agreement (install at ~/.claude/CLAUDE.md)
├── settings.snippet.json         Configuration fragment for ~/.claude/settings.json
├── rules/records.md              The records grammar; path-scoped, loads only when a record is touched
├── templates/records/            CLAUDE.md, PLAN.md, ROADMAP.md, NOTES.md and a phase file to copy into a new project
├── agents/
│   └── note-taker.md             Filing clerk: appends a numbered note to NOTES.md, tagged [by Notetaker]
├── skills/
│   ├── note/SKILL.md             /note <text> — dispatches the note-taker; the orchestrator triages later
│   ├── interview/SKILL.md        /interview — evaluate an idea, or shape a phase into a records/phases file
│   ├── open-phase/SKILL.md       /open-phase <id> — gate 1 on record → status, branch, dashboard, commit
│   ├── close-phase/SKILL.md      /close-phase — gate 2 + full gate once → Closure, freeze, propose the merge
│   └── triage/SKILL.md           /triage — every note becomes a task, a backlog item, a decision or a question
├── mods/records/                 Pilot mod: /plan-check, the dashboard as a system-prompt section, a terminal pane
└── hooks/
    ├── boot-brief.js             SessionStart: git state, PLAN's At a glance, open phase, inbox count
    ├── session-guard.js          Guards: read-only / talk mode, parallel sessions, frozen phase files
    ├── records-lint.js           The grammar as code; PostToolUse after every record edit, or run by hand
    ├── turn-footer.js            Stop hook: one footer line under each reply (branch, mode, cache)
    ├── session-cost-stop.js      Stop hook: prices tokens at API rates & logs to ledger
    ├── context-handoff-stop.js   Stop hook: halts Claude & triggers HANDOFF.md near limit
    ├── cost-report.js            CLI tool: cross-project spending analysis
    └── statusline.sh             Shell script: model | task | dir | context % meter
```

---

## Installation

### 1. Install the Agreement
Copy `CLAUDE.md` to your global Claude configuration directory:
```bash
cp CLAUDE.md ~/.claude/CLAUDE.md
```
*(If you already have a global `CLAUDE.md`, review and merge it deliberately—this agreement is meant to function as a coherent whole).*

### 2. Install the Hooks, the Rule, the Agents and the Skills
```bash
mkdir -p ~/.claude/hooks ~/.claude/rules ~/.claude/agents ~/.claude/skills
cp hooks/*.js hooks/statusline.sh ~/.claude/hooks/
cp rules/records.md ~/.claude/rules/
cp agents/*.md ~/.claude/agents/
cp -r skills/* ~/.claude/skills/
```
For a new project, copy `templates/records/` into its root and fill the placeholders (the `open-phase`
skill and `records-lint.js` expect that layout).
* **Requirements:**
  * Node.js (cross-platform for `.js` hooks).
  * `jq` for the statusline (`brew install jq` / `choco install jq` / `apt install jq`).
  * On Windows, `statusline.sh` runs via Git Bash (included with Git for Windows) or WSL.

### 3. Wire into Settings
Merge the contents of [`settings.snippet.json`](settings.snippet.json) into your `~/.claude/settings.json`:
- Adds environment defaults.
- Registers the `Stop` hooks in `hooks.Stop`, the boot brief in `hooks.SessionStart`, and the session guard in `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `Stop` and `SessionEnd`.
- Enables the custom `statusLine`.

### 4. Enable Project Cost Accounting (Opt-In)
Cost tracking is non-intrusive and enabled per-project. To turn it on, touch an empty accounting file in the root of any repository:
```bash
echo {} > project-accounting.json
```
From then on, every session records estimated API costs based on token transcripts across primary and subagents.

---

## Configuration & Tuning

Configure behavior via environment variables in `~/.claude/settings.json` (under `env`) or your shell profile:

| Variable | Default | Description |
| :--- | :--- | :--- |
| `CLAUDE_CONTEXT_HANDOFF_THRESHOLD` | `0.5` | Context window fraction (0.0–1.0) where the handoff hook prompts Claude to summarize state into `HANDOFF.md`. Re-triggers at 70%+. |
| `CLAUDE_CONTEXT_HANDOFF_DISABLED` | *unset* | Set to `1` to disable the automatic handoff trigger. |
| `CLAUDE_SESSION_COST_DISABLED` | *unset* | Set to `1` to globally disable token cost calculations. |
| `CLAUDE_PLAN_USD_MONTH` | `100` | Used by `cost-report.js` to allocate subscription costs pro-rata across projects. |

---

## Cost & Session Reports

Inspect spending across projects anytime:

```bash
# View summary of all active projects in terminal
node ~/.claude/hooks/cost-report.js

# Export cross-project metrics to Markdown
node ~/.claude/hooks/cost-report.js --md report.md

# Inspect details for a single project
node ~/.claude/hooks/cost-report.js --project myapp

# Rebuild a project's accounting ledger from past session logs
node ~/.claude/hooks/session-cost-stop.js --backfill
```

---

## Philosophy

This protocol is written in the first person (*"I plan, brief, review, verify..."*) because it represents a direct, personal pact between you and your agent. 

Adopt it as-is, speak to Claude as an engineering partner, or fork and adapt it to your team's specific stack. It is a baseline for high-trust, high-rigor development.

## License

[MIT](LICENSE)
````
