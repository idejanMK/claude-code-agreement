# claude-code-agreement

A working agreement for building software with Claude Code, packaged so it installs in one step
and can be checked for drift. You own direction and judge behaviour; Claude plans, delegates,
verifies against the running product and keeps the written record honest across sessions.

The agreement itself is [`package/agreement.md`](package/agreement.md). Read it first; everything
else here exists to make it run.

## What you get

- **The agreement** — installed as your global `CLAUDE.md`: three human gates (verify lines before
  code, behaviour acceptance at phase close, decisions), testing that earns its place, git flow,
  how records are kept.
- **Records** — one grammar for `PLAN.md`, `ROADMAP.md`, `NOTES.md`, one file per phase, a notes
  log, `FEATURES.md` and demos (FULL profile), with the shape and the upkeep of every file in one
  place: [`package/rules/records.md`](package/rules/records.md). A lint keeps them that way.
- **Procedures** — `/new-project` (fresh or `adopt`), `/interview`, `/open-phase`, `/close-phase`,
  `/note`, `/triage`.
- **Agents** — `implementer`, `reviewer`, `test-author`, `note-taker`: the briefs Claude delegates
  to.
- **Hooks** — a boot brief at session start, a context-handoff guard, a session guard (read-only and
  talk modes, parallel sessions), a cold-resume price check, a one-line footer per reply, a status
  line, and cost accounting per project. Details:
  [`reference/hooks.md`](.claude/skills/agreement-setup/reference/hooks.md).
- **Cost accounting** — opt-in per project; one row per session, written by a hook, never by hand:
  [`reference/accounting.md`](.claude/skills/agreement-setup/reference/accounting.md).
- **A mod** — the records dashboard rides every request and shows in a pane where the surface draws.

## Install

Requirements: Node ≥ 18, git, bash (on Windows: Git for Windows), `jq` for the status line.

```bash
git clone https://github.com/idejanMK/claude-code-agreement.git
cd claude-code-agreement
claude
```

Then type `/agreement-setup`. It lists what it will install into your config dir (`~/.claude`, or
`CLAUDE_CONFIG_DIR`), asks you about anything that already exists and differs, merges its entries
into `settings.json` without touching yours, and ends with a check. Restart Claude Code once so the
hooks and the status line load; run `/reload-plugins` once for the mod.

- **Check** that the install is exact, any time: `/agreement-setup check`.
- **Update**: `git pull` in this folder, then `/agreement-setup` again.
- **Remove**: delete the files [`manifest.json`](.claude/skills/agreement-setup/manifest.json)
  maps into your config dir (`CLAUDE.md`, `agents/`, `hooks/`, `rules/`, `skills/`, `mods/`,
  `templates/`) and the entries of
  [`settings.snippet.json`](.claude/skills/agreement-setup/settings.snippet.json) from your
  `settings.json`. Setup keeps a `settings.json.bak-<stamp>` from before each change.

## Start or adopt a project

In an empty folder: `/new-project`. It asks the name, the profile (FULL or LIGHT) and for your
spec (files, a few sentences, or nothing), scaffolds the records and the cost ledger, commits on
`main`, and hands over to `/interview`, which proposes the milestones and the first phase from the
spec. Nothing is built before you approve the verify lines.

In an existing repo: `/new-project adopt`. Adds only what is missing, never edits your files
without asking, and feeds your README into the interview.

## Tuning

Environment variables, set under `env` in `settings.json`:

| Variable | Package default | What it does |
|---|---|---|
| `CLAUDE_CONTEXT_HANDOFF_THRESHOLD` | `0.35` | Context fraction at which the handoff hook asks Claude to write `HANDOFF.md` and recommend a fresh session (the hook's own default is 0.5). |
| `CLAUDE_CONTEXT_HANDOFF_DISABLED` | unset | `1` turns the handoff hook off. |
| `CLAUDE_COLD_RESUME_MIN_USD` | `5` | The cold-resume gate speaks up when re-writing an expired cache would cost at least this. It blocks the prompt once and offers two numbered choices: recall the prompt and send it again to continue, or `/clear` and start fresh. |
| `CLAUDE_COLD_RESUME_DISABLED` | unset | `1` turns the gate off. |
| `CLAUDE_SESSION_COST_DISABLED` | unset | `1` stops cost rows for the session. |
| `CLAUDE_PLAN_USD_MONTH` | `100` | Plan price `cost-report.js` allocates across projects. |

Cost reports: `node ~/.claude/hooks/cost-report.js` (`--md FILE`, `--project NAME`); rebuild a
ledger with `node ~/.claude/hooks/session-cost-stop.js --backfill` in the project root.

## This repo

`package/` is the installable part, shaped like `~/.claude`. The repo is itself a project under the
agreement: `PLAN.md`, `ROADMAP.md`, `records/` are its own records. Changes land on branches and
are merged `--no-ff` to `main`; tests: `node --test "tests/*.test.js"`.

## License

[MIT](LICENSE)
