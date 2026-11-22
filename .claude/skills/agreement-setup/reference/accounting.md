# Accounting — cost per session, per project

**Opt-in per project.** `project-accounting.json` in the project root turns it on; absent = off.
`/new-project` creates it (fresh or adopt). To turn it off, delete the file.

**How a row gets there.** After every reply the Stop hook `session-cost-stop.js` sums the token
usage of the session's transcript (main thread plus subagents), prices it at Anthropic API list
rates (`cost-lib.js`, one table), and upserts one row keyed by session id. Rows carry date, active
hours, branches, turns, tokens, estimated USD and per-model counts — never a local path, because the
ledger is committed with the project. The figure is an estimate of API-equivalent spend, not a bill.

**Nobody edits a figure by hand.** A wrong or missing total is rebuilt from the transcripts:
`node ~/.claude/hooks/session-cost-stop.js --backfill` in the project root. The orchestrator sums the
phase's rows at closure into the phase file ("cost: ~$X (N sessions)").

**Beside it:** `project-accounting.html` (rendered by `cost-html.js` on every stop; ignore it in git
or commit it, your call) and the cross-project report `node ~/.claude/hooks/cost-report.js`
(`--md FILE`, `--project NAME`; plan price `CLAUDE_PLAN_USD_MONTH`, default 100).

**Off switch for a session:** `CLAUDE_SESSION_COST_DISABLED=1`.

Shape and upkeep: `rules/records.md` → project-accounting.json.
