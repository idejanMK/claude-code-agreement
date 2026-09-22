# claude-code-agreement

A global `CLAUDE.md` "working agreement" for [Claude Code](https://claude.com/claude-code),
plus three small hooks that make parts of it self-enforcing:

- **Cost tracking** that writes itself — no one ever reports a dollar figure by hand.
- **Context handoff** — near the end of a context window, Claude is told to write a
  `HANDOFF.md` briefing and stop, instead of degrading silently.
- **A statusline** showing model, current task, directory, and context usage.

The agreement itself covers how to plan work (verify lines approved before code),
how much testing actually earns its place, git discipline (branch per phase, no
force-push to main), and a set of records (`PLAN.md`, `ROADMAP.md`, `HANDOFF.md`)
that keep a session honest across restarts. Read [`CLAUDE.md`](CLAUDE.md) — that
file *is* the product; everything else just wires two pieces of it into Claude Code.

It's written in first person ("I plan, brief, review...") because it's a personal
agreement between one person and their agent. Adopt it as-is and speak to Claude
as "I" would, or edit it to fit how you work — it's a starting point, not a standard.

## What's here

```
CLAUDE.md                     the agreement — put this at ~/.claude/CLAUDE.md
hooks/session-cost-stop.js    Stop hook: prices a session's tokens, writes the row
hooks/cost-report.js          cross-project cost report (run manually, anytime)
hooks/context-handoff-stop.js Stop hook: blocks + asks Claude to write HANDOFF.md near the context limit
hooks/statusline.sh           statusline: model | task | dir | context bar
settings.snippet.json         the settings.json fragment that wires the two hooks + statusline in
```

## Install

1. **Copy the agreement.**
   Put `CLAUDE.md` at `~/.claude/CLAUDE.md`. If you already have one there, merge
   by hand — this file is meant to be read whole, not appended to piecemeal.

2. **Copy the hooks.**
   ```
   mkdir -p ~/.claude/hooks
   cp hooks/*.js hooks/statusline.sh ~/.claude/hooks/
   ```
   The `.js` hooks run under Node and work on any OS. `statusline.sh` is a bash
   script — on Windows it needs Git Bash (already on your PATH if you have Git
   installed) or WSL; Claude Code's own `shell: "bash"` hook entries already
   assume that.
   Requires `jq` on your PATH for the statusline (`choco install jq` / `brew install jq`
   / `apt install jq`).

3. **Wire the hooks into `~/.claude/settings.json`.**
   Merge the contents of [`settings.snippet.json`](settings.snippet.json) into your
   existing `settings.json` — specifically the `env`, `hooks.Stop`, and `statusLine`
   keys. If you already have other `Stop` hooks, add these as additional entries in
   the same array rather than replacing it.

4. **Opt a project in to cost tracking.**
   The cost hook only writes to a project if `project-accounting.json` already
   exists at that project's root — it's opt-in per project, not global. Create an
   empty ledger to turn it on:
   ```
   echo {} > project-accounting.json
   ```
   From then on, every session in that directory gets a row (main + subagent
   transcripts, priced at Anthropic list rates — an estimate, not a bill). If the
   project also has a `HANDOFF.md`, its cost line is kept in sync automatically.

## Customize

Environment variables (set in `~/.claude/settings.json`'s `env` block, or per-shell):

| Variable | Default | Effect |
|---|---|---|
| `CLAUDE_CONTEXT_HANDOFF_THRESHOLD` | `0.5` | Fraction of the context window (0–1) at which the handoff hook first fires. Re-fires every further 10 points of growth, and always at 70%+. |
| `CLAUDE_CONTEXT_HANDOFF_DISABLED` | unset | Set to `1` to turn the context-handoff hook off entirely. |
| `CLAUDE_SESSION_COST_DISABLED` | unset | Set to `1` to turn the cost hook off entirely (per project, delete `project-accounting.json` instead). |
| `CLAUDE_PLAN_USD_MONTH` | `100` | Only read by `cost-report.js` — your subscription's monthly price, used to allocate it across projects pro rata. |

## Reports

```
node ~/.claude/hooks/cost-report.js                       # every project, to stdout
node ~/.claude/hooks/cost-report.js --md report.md         # also write Markdown
node ~/.claude/hooks/cost-report.js --project myapp        # one project's detail

node ~/.claude/hooks/session-cost-stop.js --backfill       # rebuild a project's ledger
                                                             # from its transcripts (run
                                                             # from that project's root)
```

## License

MIT — see [LICENSE](LICENSE).
