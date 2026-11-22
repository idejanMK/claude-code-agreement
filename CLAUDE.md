# claude-code-agreement

**Profile:** LIGHT — trigger: a process package; no money logic, one user, no tenants.

**What:** the working-agreement system for Claude Code, packaged so anyone installs it with one skill,
starts or adopts a project with records and cost accounting from the first session, and checks the
install is exact.

**Stack:** Markdown, Node ≥ 18 (hooks, setup script, lint), bash (hooks run under it). No dependencies.

**Commands:** test `node --test "tests/*.test.js"` · lint `node package/hooks/records-lint.js .` · install check
`node .claude/skills/agreement-setup/setup.js check` · setup `/agreement-setup`.

## Where things are (read on demand, not at boot)

| Need | Read |
|---|---|
| the installable package, shaped like `~/.claude` | `package/` (`agreement.md` installs as `CLAUDE.md`) |
| what goes where on install | `.claude/skills/agreement-setup/manifest.json` |
| the open phase, its tasks and verify lines | the file PLAN.md's "Phase file" line names |
| what is next, whose turn it is | PLAN.md (the boot brief already shows it) |
| why we decided something | ROADMAP.md → Decisions |
| what is parked for later | ROADMAP.md → Backlog |
| a durable surprise about this repo | ROADMAP.md → Gotchas |
| the user's untriaged notes | NOTES.md |
| how to open, close or triage | `/open-phase`, `/close-phase`, `/triage` |

## Quirks

- The agreement itself is `package/agreement.md`. It is not loaded here as a nested CLAUDE.md on
  purpose; the installed copy in `~/.claude/CLAUDE.md` is what runs. Edit the package, then reinstall.
- This repo is public. Nothing under `package/`, the records or the README may carry a name, a local
  path, an email or a server detail.
- `package/templates/records/CLAUDE.md` is a template with placeholders, not instructions for here.
