#!/usr/bin/env node
// Installs the agreement package into a Claude config dir without clobbering what is there.
// Usage: node setup.js <plan|apply|check> [--take-ours a,b,c] [--config-dir DIR] [--json]
"use strict";
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const TOKEN = "{{CONFIG_DIR}}";
const slashes = (s) => s.replace(/\\/g, "/");
const clone = (o) => JSON.parse(JSON.stringify(o));
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function normalizeText(s) {
  return s.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
}
const sameContent = (a, b) => normalizeText(a) === normalizeText(b);

function configDir(env = process.env, home = os.homedir()) {
  const d = env.CLAUDE_CONFIG_DIR ? env.CLAUDE_CONFIG_DIR : home + "/.claude";
  return slashes(d).replace(/\/+$/, "");
}

const render = (str, dir) => str.split(TOKEN).join(dir);
function renderDeep(v, dir) {
  if (typeof v === "string") return render(v, dir);
  if (Array.isArray(v)) return v.map((x) => renderDeep(x, dir));
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, renderDeep(x, dir)]));
  return v;
}

// Paths are case-insensitive on Windows and macOS, not on Linux.
const CASELESS = process.platform === "win32" || process.platform === "darwin";
function commandKey(cmd, dir) {
  let s = slashes(cmd);
  s = s.replace(new RegExp(esc(slashes(dir)), CASELESS ? "gi" : "g"), TOKEN);
  // "$HOME/.claude" and "~/.claude" only mean this dir when it is a home-style .claude dir;
  // under a custom CLAUDE_CONFIG_DIR they would be a false match.
  if (/\/\.claude$/.test(slashes(dir))) s = s.replace(/\$HOME\/\.claude/g, TOKEN).replace(/~\/\.claude/g, TOKEN);
  return s.replace(/\s+/g, " ").trim();
}

const scriptName = (cmd) => (/[\w.-]+\.(?:js|sh)(?![\w])/.exec(cmd) || [])[0];
const isObj = (v) => !!v && typeof v === "object" && !Array.isArray(v);
const matcherOf = (e) => e.matcher || undefined;

function mergeSettings(existing, snippet, dir, opts = {}) {
  const settings = clone(existing);
  const take = new Set(opts.takeOurs || []);
  const added = [], present = [], clashes = [];
  const ours = renderDeep(snippet, dir);
  // Shared outcome: absent -> add, equal -> present, else clash (or take ours).
  const decide = (key, has, equal, set, theirs, ourVal) => {
    if (!has) { set(); added.push(key); }
    else if (equal) present.push(key);
    else if (take.has(key)) { set(); added.push(key); }
    else clashes.push({ key, theirs, ours: ourVal });
  };

  for (const [name, val] of Object.entries(ours.env || {})) {
    settings.env = settings.env || {};
    decide(`env.${name}`, name in settings.env, settings.env[name] === val,
      () => { settings.env[name] = val; }, settings.env[name], val);
  }

  if (ours.statusLine) {
    const t = settings.statusLine, o = ours.statusLine;
    decide("statusLine", !!t, t && t.type === o.type && commandKey(t.command || "", dir) === commandKey(o.command, dir),
      () => { settings.statusLine = clone(o); }, t && t.command, o.command);
  }

  for (const [event, entries] of Object.entries(ours.hooks || {})) {
    settings.hooks = settings.hooks || {};
    settings.hooks[event] = settings.hooks[event] || [];
    const list = settings.hooks[event];
    for (const entry of entries) {
      const fresh = [];
      for (const h of entry.hooks) {
        const base = scriptName(h.command);
        const ourKey = commandKey(h.command, dir);
        const key = `hooks.${event}.${base || ourKey}`;
        const handlers = list.flatMap((e) => (e.hooks || []).map((x) => ({ e, x })));
        if (handlers.some(({ e, x }) => matcherOf(e) === matcherOf(entry) && commandKey(x.command || "", dir) === ourKey)) {
          present.push(key);
          continue;
        }
        const other = base && handlers.find(({ x }) => scriptName(x.command || "") === base);
        if (!other) { fresh.push(clone(h)); added.push(key); }
        else if (take.has(key)) {
          other.x.command = h.command; other.x.shell = h.shell; other.x.timeout = h.timeout;
          added.push(key);
        } else clashes.push({ key, theirs: other.x.command, ours: h.command });
      }
      if (fresh.length) {
        const e = {};
        if (entry.matcher) e.matcher = entry.matcher;
        e.hooks = fresh;
        list.push(e);
      }
    }
  }

  for (const [name, val] of Object.entries(ours.extraKnownMarketplaces || {})) {
    settings.extraKnownMarketplaces = settings.extraKnownMarketplaces || {};
    const t = settings.extraKnownMarketplaces[name];
    const eq = t && t.source && t.source.source === val.source.source &&
      commandKey(t.source.path || "", dir) === commandKey(val.source.path, dir);
    decide(`extraKnownMarketplaces.${name}`, !!t, eq,
      () => { settings.extraKnownMarketplaces[name] = clone(val); }, t && t.source && t.source.path, val.source.path);
  }

  for (const id of Object.keys(ours.enabledPlugins || {})) {
    settings.enabledPlugins = settings.enabledPlugins || {};
    const has = id in settings.enabledPlugins;
    decide(`enabledPlugins.${id}`, has, settings.enabledPlugins[id] === true,
      () => { settings.enabledPlugins[id] = true; }, settings.enabledPlugins[id], true);
  }

  return { settings, added, present, clashes };
}

function checkSettings(existing, snippet, dir) {
  const r = mergeSettings(existing, snippet, dir);
  return { exact: !r.added.length && !r.clashes.length, missing: r.added, different: r.clashes.map((c) => c.key) };
}

function walk(root, sub = "") {
  const out = [];
  const ents = fs.readdirSync(path.join(root, sub), { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
  for (const d of ents) {
    const rel = sub ? `${sub}/${d.name}` : d.name;
    if (d.isDirectory()) out.push(...walk(root, rel)); else out.push(rel);
  }
  return out;
}

function planFiles(packageDir, manifest, dir) {
  const plan = { create: [], same: [], differ: [], unlisted: [] };
  const covered = new Set();
  for (const f of manifest.files) {
    const src = path.join(packageDir, f.from);
    const subs = fs.statSync(src).isDirectory() ? walk(src).map((r) => "/" + r) : [""];
    for (const sub of subs) {
      const from = path.join(packageDir, f.from + sub), to = path.join(dir, f.to + sub);
      covered.add(slashes(f.from + sub));
      const item = { from, to, rel: slashes(path.relative(dir, to)) };
      if (!fs.existsSync(to)) plan.create.push(item);
      else if (sameContent(fs.readFileSync(from, "utf8"), fs.readFileSync(to, "utf8"))) plan.same.push(item);
      else plan.differ.push(item);
    }
  }
  plan.unlisted = walk(packageDir).filter((r) => !covered.has(r)).sort();
  return plan;
}

function applyFiles(plan, opts = {}) {
  const take = new Set(opts.takeOurs || []);
  const written = [], kept = [];
  const put = (i) => { fs.mkdirSync(path.dirname(i.to), { recursive: true }); fs.copyFileSync(i.from, i.to); written.push(i.rel); };
  plan.create.forEach(put);
  for (const i of plan.differ) (take.has(i.rel) ? put(i) : kept.push(i.rel));
  return { written, kept };
}

// ---- CLI ----
function parseArgs(argv) {
  const a = { cmd: argv[0], takeOurs: [], json: false, dir: configDir() };
  for (let i = 1; i < argv.length; i++) {
    if (argv[i] === "--take-ours") a.takeOurs = (argv[++i] || "").split(",").filter(Boolean);
    else if (argv[i] === "--config-dir") a.dir = configDir({ CLAUDE_CONFIG_DIR: argv[++i] || "" });
    else if (argv[i] === "--json") a.json = true;
  }
  return a;
}

const stamp = () => new Date().toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15);
const list = (title, items) => { if (items.length) console.log(`${title}:\n${items.map((x) => "  " + x).join("\n")}`); };
const rels = (items) => items.map((i) => i.rel);
const fmt = (c) => `${c.key}: ${JSON.stringify(c.theirs)} -> ${JSON.stringify(c.ours)}`;

function main() {
  const a = parseArgs(process.argv.slice(2));
  if (!["plan", "apply", "check"].includes(a.cmd)) {
    console.error("usage: node setup.js <plan|apply|check> [--take-ours a,b,c] [--config-dir DIR] [--json]");
    process.exit(2);
  }
  const packageDir = path.resolve(__dirname, "../../../package");
  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, "manifest.json"), "utf8"));
  const snippet = JSON.parse(fs.readFileSync(path.join(__dirname, "settings.snippet.json"), "utf8"));
  const settingsPath = path.join(a.dir, "settings.json");
  const hasSettings = fs.existsSync(settingsPath);

  if (a.cmd === "apply") {
    for (const bin of ["git", "bash"]) {
      try { execFileSync(bin, ["--version"], { stdio: "ignore" }); } catch {
        console.log(`missing: ${bin} — install it, nothing was changed`);
        process.exit(2);
      }
    }
  }
  let existing = {};
  if (hasSettings) {
    try { existing = JSON.parse(normalizeText(fs.readFileSync(settingsPath, "utf8"))); } catch (e) {
      console.log(`${settingsPath} is not valid JSON (${e.message}); fix it first, nothing was changed`);
      process.exit(2);
    }
    const bad = !isObj(existing) ? "the file"
      : ["env", "hooks", "extraKnownMarketplaces", "enabledPlugins"].find((k) => k in existing && !isObj(existing[k]))
      || (isObj(existing.hooks) && Object.keys(existing.hooks).find((ev) => !Array.isArray(existing.hooks[ev])) && "hooks.<event>");
    if (bad) {
      console.log(`${settingsPath}: ${bad} is not the shape Claude Code expects; fix it first, nothing was changed`);
      process.exit(2);
    }
  }

  const plan = planFiles(packageDir, manifest, a.dir);
  const merged = mergeSettings(existing, snippet, a.dir, { takeOurs: a.cmd === "apply" ? a.takeOurs : [] });

  if (a.cmd === "plan") {
    if (a.json) console.log(JSON.stringify({ dir: a.dir, files: plan, settings: { added: merged.added, present: merged.present, clashes: merged.clashes } }, null, 2));
    else {
      list("files to create", rels(plan.create)); list("files same", rels(plan.same));
      list("files differ", rels(plan.differ)); list("files not in manifest", plan.unlisted);
      list("settings to add", merged.added); list("settings present", merged.present);
      list("settings clashes (theirs -> ours)", merged.clashes.map(fmt));
    }
    return;
  }

  if (a.cmd === "check") {
    const c = checkSettings(existing, snippet, a.dir);
    const exact = !plan.create.length && !plan.differ.length && !plan.unlisted.length && c.exact;
    if (exact) { console.log("exact"); return; }
    list("files missing", rels(plan.create)); list("files differ", rels(plan.differ));
    list("files not in manifest", plan.unlisted); list("settings missing", c.missing);
    list("settings different", c.different);
    process.exit(1);
  }

  // A --take-ours name that matches no clash is a typo: refuse before any write.
  const known = new Set([...rels(plan.differ), ...mergeSettings(existing, snippet, a.dir).clashes.map((c) => c.key)]);
  const unknown = a.takeOurs.filter((k) => !known.has(k));
  if (unknown.length) {
    console.log(`--take-ours names no clash: ${unknown.join(", ")}; nothing was changed`);
    process.exit(2);
  }
  // Backup first, then files, then settings written atomically (temp file + rename).
  let backup = null;
  const settingsChange = JSON.stringify(merged.settings) !== JSON.stringify(existing);
  fs.mkdirSync(a.dir, { recursive: true });
  if (settingsChange && hasSettings) { backup = `${settingsPath}.bak-${stamp()}`; fs.copyFileSync(settingsPath, backup); }
  const files = applyFiles(plan, { takeOurs: a.takeOurs });
  if (settingsChange) {
    const tmp = `${settingsPath}.tmp-${process.pid}`;
    fs.writeFileSync(tmp, JSON.stringify(merged.settings, null, 2) + "\n");
    fs.renameSync(tmp, settingsPath);
  }
  list("written", files.written);
  list("kept (use --take-ours <rel> to overwrite)", files.kept);
  list("settings added", merged.added);
  list("settings clashes kept (use --take-ours <key>)", merged.clashes.map(fmt));
  if (backup) console.log(`backup: ${backup}`);
}

module.exports = { normalizeText, sameContent, configDir, render, commandKey, mergeSettings, checkSettings, planFiles, applyFiles };

if (require.main === module) main();
