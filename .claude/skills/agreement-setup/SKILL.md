---
name: agreement-setup
description: Install the working-agreement system into this machine's Claude Code config (~/.claude or CLAUDE_CONFIG_DIR) from the package in this repo, merge its settings without touching the user's own, and check that the install is exact. Use when the user says "install the agreement", "set up the agreement", "/agreement-setup", or "/agreement-setup check". Once per machine; rerun after a git pull to update.
---

# /agreement-setup — install, update or check the package

One script does the work; this skill does the talking. Nothing is ever overwritten without the
user naming it. Script: `.claude/skills/agreement-setup/setup.js`. What it installs:
`manifest.json` (files) and `settings.snippet.json` (settings entries). What each piece is:
`reference/global.md`, `reference/local.md`, `reference/hooks.md`, `reference/mods.md`,
`reference/documentation-files.md`, `reference/accounting.md`.

## Modes

- `/agreement-setup` — install or update.
- `/agreement-setup check` — compare only, change nothing (steps 1 and 5).
- `/agreement-setup plan` — show what would change, change nothing (steps 1 and 2).

## Steps

1. **Prerequisites.** `node --version` (≥ 18), `git --version`, `bash --version`. Anything missing:
   stop and name it (Windows: Git for Windows provides bash). Nothing is written.
2. **Plan.** `node .claude/skills/agreement-setup/setup.js plan`. Tell the user in four lines: files
   to create (count), files that differ (each, by path), settings entries to add (count), settings
   clashes (each: `key: theirs → ours`). Files already identical and settings already present are not
   news; say "N already exact" and move on.
3. **Clashes are the user's call.** For every differing file and every settings clash ask ONE
   AskUserQuestion (multi-select): keep theirs (default) or take ours. "Stop" is always an option.
   Never take ours by default — a stranger's `statusLine` or threshold is theirs.
4. **Apply.** `node .claude/skills/agreement-setup/setup.js apply --take-ours <rel-or-key,...>`
   with exactly what the user chose. The script backs `settings.json` up to
   `settings.json.bak-<stamp>` before writing, refuses invalid JSON, and reports written / kept.
5. **Check.** `node .claude/skills/agreement-setup/setup.js check`. Report `exact`, or each file
   and key it names. A kept clash shows here as "different" — that is correct, say so.
6. **Tell the user what changes now.** Hooks and the status line load at the next Claude Code
   start; restart it. The records mod needs `/reload-plugins` once. Cost accounting is opt-in per
   project: `/new-project` (fresh or `adopt`) turns it on by creating `project-accounting.json`.
   Update later = `git pull` in this repo, then `/agreement-setup` again.

## Rules

- The config dir is `CLAUDE_CONFIG_DIR` if set, else `~/.claude`. `--config-dir X` overrides, for a
  throwaway install.
- The script never deletes, reorders or edits an entry it did not add. Extra hooks, env, plugins and
  permissions of the user stay as they are and never count as "not exact".
- A package file the manifest does not cover makes `check` fail with "unlisted": add it to
  `manifest.json`, never ignore it.
- Removal: the files are the manifest's targets, plus the settings keys in the snippet; the README
  lists them.
