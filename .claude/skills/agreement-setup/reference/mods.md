# Mods — the records mod

A mod is a local Claude Code plugin that changes the interface. The package ships one,
`mods/records/`: `/plan-check` lints the records against the grammar, PLAN's "At a glance" rides
every request as a system-prompt section, and a pane shows it where the surface draws (terminal,
desktop app).

How it is wired (both entries are added to `settings.json` by setup):

```json
"extraKnownMarketplaces": { "records-mods": { "source": { "source": "directory", "path": "<config dir>/mods/records" } } },
"enabledPlugins": { "records@records-mods": true }
```

After install or update run `/reload-plugins` once, or restart Claude Code. If the mod does not load,
`claude plugin list` shows whether `records@records-mods` is known; the marketplace path must be the
absolute config dir with forward slashes.
