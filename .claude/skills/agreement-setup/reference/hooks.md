# Hooks — what runs when

All hooks are Node scripts run under bash (`"shell": "bash"` in the wiring). Every one fails open:
a hook error never blocks a session. Paths in the wiring are absolute to the config dir.

| Event | Hook | What it does |
|---|---|---|
| SessionStart | `boot-brief.js` | Registers the session, prints the boot brief into context: git log, branch and tree state, unpushed commits, PLAN's "At a glance", HANDOFF.md if newer than the last commit, untriaged notes, other sessions open in this checkout, `.scratch/` size. |
| UserPromptSubmit | `session-guard.js prompt` | Reads the user's wording for read-only or talk mode. |
| UserPromptSubmit | `cold-resume-gate.js` | When the prompt cache is cold and the re-write would cost real money, says so before the turn runs. `CLAUDE_COLD_RESUME_MIN_USD`, `CLAUDE_COLD_RESUME_DISABLED=1`. |
| PreToolUse | `session-guard.js pre` | Blocks edits and git writes in read-only or talk mode, and in a checkout another session is working in. |
| PostToolUse | `session-guard.js post` | Bookkeeping after an edit. |
| PostToolUse | `records-lint.js --hook` | Lints a record file after every edit to it; reports what is off. |
| Stop | `context-handoff-stop.js` | At `CLAUDE_CONTEXT_HANDOFF_THRESHOLD` (default 0.35 of the context) asks Claude to write HANDOFF.md and recommend a fresh session; escalates with growth. `CLAUDE_CONTEXT_HANDOFF_DISABLED=1`. |
| Stop | `session-cost-stop.js; cost-html.js` | Writes the session's cost row into `project-accounting.json` when the project opted in, then renders `project-accounting.html`. See `accounting.md`. |
| Stop | `session-guard.js stop` | Session registry upkeep. |
| Stop | `turn-footer.js` | One footer line under each reply (branch, changes, unpushed, mode, cache state and the price of resuming). No model call. |
| SessionEnd | `session-guard.js end` | Unregisters the session. |
| statusLine | `statusline.sh` | Model, task, directory, context use; relays the context percentage to the handoff hook. |

Shared, not wired: `cost-lib.js` (the one price table), `cost-report.js` (cross-project report, run
by hand), `records-lint.js` (also run by hand: `node ~/.claude/hooks/records-lint.js [root]`).
