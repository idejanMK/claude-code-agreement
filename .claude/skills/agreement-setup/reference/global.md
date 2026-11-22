# Global — what lands in the config dir (`~/.claude` or `CLAUDE_CONFIG_DIR`)

| Package path | Installed as | What it is |
|---|---|---|
| `agreement.md` | `CLAUDE.md` | The working agreement: how the orchestrator and the user collaborate. Loads in every session on this machine. |
| `agents/*.md` | `agents/` | Four subagent briefs: `implementer`, `reviewer`, `test-author`, `note-taker`. The orchestrator delegates to them by name. |
| `hooks/*.js`, `hooks/statusline.sh` | `hooks/` | The automation; see `hooks.md`. |
| `rules/records.md` | `rules/` | The records grammar; loads whenever a record file is touched. The one home for every record file's shape and upkeep. |
| `skills/<name>/SKILL.md` | `skills/` | Procedures: `interview`, `open-phase`, `close-phase`, `note`, `triage`, `new-project`. |
| `mods/records/` | `mods/` | The records mod (a local plugin); see `mods.md`. |
| `templates/records/` | `templates/` | The record templates `/new-project` scaffolds from; see `documentation-files.md`. |

Settings entries (merged into `settings.json`, never replacing it): the hook wiring, `statusLine`,
`env.CLAUDE_CONTEXT_HANDOFF_THRESHOLD`, the mod's marketplace entry and `enabledPlugins` line.
Everything else in `settings.json` is the user's.

Not installed, by design: a personal `~/.claude` git repo, project paths, deploy or board tooling,
third-party skills.
