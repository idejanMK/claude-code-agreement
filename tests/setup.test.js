const { test, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const S = require("../.claude/skills/agreement-setup/setup.js");
const SNIP = JSON.parse(fs.readFileSync(path.join(__dirname, "../.claude/skills/agreement-setup/settings.snippet.json"), "utf8"));
const DIR = "C:/u/.claude";
const clone = (o) => JSON.parse(JSON.stringify(o));
const only = (...keys) => Object.fromEntries(keys.map((k) => [k, clone(SNIP[k])]));
const tmps = [];
const tmp = () => { const d = fs.mkdtempSync(path.join(os.tmpdir(), "setup-test-")); tmps.push(d); return d; };
after(() => tmps.forEach((d) => fs.rmSync(d, { recursive: true, force: true })));
const put = (root, rel, text) => { const p = path.join(root, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, text); };

test("normalizeText strips BOM, CRLF and lone CR", () => {
  assert.equal(S.normalizeText("\uFEFFa\r\nb\rc\n"), "a\nb\nc\n");
});
test("sameContent: LF vs CRLF is true, different text is false", () => {
  assert.equal(S.sameContent("a\nb\n", "a\r\nb\r\n"), true);
  assert.equal(S.sameContent("a\nb", "a\nc"), false);
});

test("configDir default, override, trailing slash, backslashes", () => {
  assert.equal(S.configDir({}, "C:\\Users\\x"), "C:/Users/x/.claude");
  assert.equal(S.configDir({ CLAUDE_CONFIG_DIR: "" }, "C:\\Users\\x"), "C:/Users/x/.claude");
  assert.equal(S.configDir({ CLAUDE_CONFIG_DIR: "D:\\cfg\\" }, "C:\\Users\\x"), "D:/cfg");
  assert.equal(S.configDir({ CLAUDE_CONFIG_DIR: "D:/cfg/" }, "C:/h"), "D:/cfg");
});

test("render replaces every {{CONFIG_DIR}}", () => {
  assert.equal(S.render("{{CONFIG_DIR}}/a {{CONFIG_DIR}}/b", "X"), "X/a X/b");
});

test("commandKey: Windows absolute equals token form", () => {
  const a = S.commandKey('node "C:\\Users\\x\\.claude\\hooks\\a.js" pre', "C:/Users/x/.claude");
  const b = S.commandKey('node "{{CONFIG_DIR}}/hooks/a.js"  pre', "C:/Users/x/.claude");
  assert.equal(a, b);
});
test("commandKey: $HOME/.claude and ~/.claude forms, case-insensitive dir", () => {
  const t = S.commandKey('node "{{CONFIG_DIR}}/hooks/a.js"', "C:/Users/x/.claude");
  assert.equal(S.commandKey('node "$HOME/.claude/hooks/a.js"', "C:/Users/x/.claude"), t);
  assert.equal(S.commandKey('node "~/.claude/hooks/a.js"', "C:/Users/x/.claude"), t);
  assert.equal(S.commandKey('node "c:/users/X/.CLAUDE/hooks/a.js"', "C:/Users/x/.claude"), t);
});
test("commandKey collapses whitespace and trims", () => {
  assert.equal(S.commandKey("  node   a.js \t pre  ", DIR), "node a.js pre");
});

test("mergeSettings into empty: all keys added, dir rendered", () => {
  const r = S.mergeSettings({}, SNIP, DIR);
  for (const k of ["env.CLAUDE_CONTEXT_HANDOFF_THRESHOLD", "statusLine", "hooks.SessionStart.boot-brief.js",
    "hooks.Stop.session-cost-stop.js", "hooks.PreToolUse.session-guard.js", "extraKnownMarketplaces.records-mods",
    "enabledPlugins.records@records-mods"]) assert.ok(r.added.includes(k), k);
  assert.deepEqual(r.present, []);
  assert.deepEqual(r.clashes, []);
  assert.ok(!JSON.stringify(r.settings).includes("{{CONFIG_DIR}}"));
  assert.ok(JSON.stringify(r.settings).includes(DIR));
});

test("mergeSettings: same hook with Windows absolute path is present, nothing added", () => {
  const s = JSON.stringify({ hooks: clone(SNIP.hooks) }).replace(/\{\{CONFIG_DIR\}\}\/hooks\/([\w.-]+)/g, "C:\\\\u\\\\.claude\\\\hooks\\\\$1");
  const ex = JSON.parse(s);
  assert.ok(ex.hooks.Stop[0].hooks[0].command.includes("C:\\u\\.claude\\hooks\\"));
  const r = S.mergeSettings(ex, only("hooks"), DIR);
  assert.deepEqual(r.added, []);
  assert.deepEqual(r.clashes, []);
  assert.ok(r.present.includes("hooks.Stop.session-cost-stop.js"));
  assert.equal(r.settings.hooks.Stop.length, ex.hooks.Stop.length);
  assert.equal(r.settings.hooks.PostToolUse[0].hooks.length, 2);
});

test("mergeSettings: differing env is a clash, kept; takeOurs sets ours", () => {
  const ex = { env: { CLAUDE_CONTEXT_HANDOFF_THRESHOLD: "0.9" } };
  const r = S.mergeSettings(ex, only("env"), DIR);
  const key = "env.CLAUDE_CONTEXT_HANDOFF_THRESHOLD";
  const ours = SNIP.env.CLAUDE_CONTEXT_HANDOFF_THRESHOLD;
  assert.deepEqual(r.clashes, [{ key, theirs: "0.9", ours }]);
  assert.equal(r.settings.env.CLAUDE_CONTEXT_HANDOFF_THRESHOLD, "0.9");
  const t = S.mergeSettings(ex, only("env"), DIR, { takeOurs: [key] });
  assert.equal(t.settings.env.CLAUDE_CONTEXT_HANDOFF_THRESHOLD, ours);
  assert.ok(t.added.includes(key));
  assert.deepEqual(t.clashes, []);
});

test("mergeSettings: equal env is present", () => {
  const r = S.mergeSettings({ env: { CLAUDE_CONTEXT_HANDOFF_THRESHOLD: SNIP.env.CLAUDE_CONTEXT_HANDOFF_THRESHOLD } }, only("env"), DIR);
  assert.deepEqual(r.present, ["env.CLAUDE_CONTEXT_HANDOFF_THRESHOLD"]);
});

test("mergeSettings: same script basename with different args is a clash; takeOurs replaces", () => {
  const snip = { hooks: { UserPromptSubmit: [{ hooks: [{ type: "command", command: 'node "{{CONFIG_DIR}}/hooks/session-guard.js" prompt', shell: "bash", timeout: 10 }] }] } };
  const ex = { hooks: { UserPromptSubmit: [{ hooks: [{ type: "command", command: 'node "C:/u/.claude/hooks/session-guard.js" prompt --quiet', timeout: 99 }] }] } };
  const r = S.mergeSettings(ex, snip, DIR);
  assert.equal(r.clashes.length, 1);
  assert.equal(r.clashes[0].key, "hooks.UserPromptSubmit.session-guard.js");
  assert.equal(r.settings.hooks.UserPromptSubmit[0].hooks[0].command, ex.hooks.UserPromptSubmit[0].hooks[0].command);
  const t = S.mergeSettings(ex, snip, DIR, { takeOurs: ["hooks.UserPromptSubmit.session-guard.js"] });
  const h = t.settings.hooks.UserPromptSubmit[0].hooks[0];
  assert.equal(h.command, 'node "C:/u/.claude/hooks/session-guard.js" prompt');
  assert.equal(h.shell, "bash");
  assert.equal(h.timeout, 10);
  assert.equal(t.settings.hooks.UserPromptSubmit.length, 1);
});

test("mergeSettings: unrelated PowerShell beep, permissions, model and extra env survive", () => {
  const beep = { matcher: "", hooks: [{ type: "command", command: "powershell -c [console]::beep()", shell: "powershell" }] };
  const ex = { permissions: { allow: ["Bash(ls)"] }, model: "opus", env: { MINE: "1" }, hooks: { Stop: [beep] } };
  const r = S.mergeSettings(ex, SNIP, DIR);
  assert.deepEqual(r.settings.permissions, ex.permissions);
  assert.equal(r.settings.model, "opus");
  assert.equal(r.settings.env.MINE, "1");
  assert.deepEqual(r.settings.hooks.Stop[0], beep);
  assert.ok(r.settings.hooks.Stop.length > 1);
});

test("mergeSettings: enabledPlugins false is a clash; takeOurs sets true", () => {
  const ex = { enabledPlugins: { "records@records-mods": false } };
  const r = S.mergeSettings(ex, only("enabledPlugins"), DIR);
  assert.equal(r.clashes[0].key, "enabledPlugins.records@records-mods");
  assert.equal(r.settings.enabledPlugins["records@records-mods"], false);
  const t = S.mergeSettings(ex, only("enabledPlugins"), DIR, { takeOurs: ["enabledPlugins.records@records-mods"] });
  assert.equal(t.settings.enabledPlugins["records@records-mods"], true);
});

test("mergeSettings: marketplace with same path (token vs rendered) is present, other path clashes", () => {
  const same = { extraKnownMarketplaces: { "records-mods": { source: { source: "directory", path: "C:\\u\\.claude\\mods\\records" } } } };
  assert.deepEqual(S.mergeSettings(same, only("extraKnownMarketplaces"), DIR).present, ["extraKnownMarketplaces.records-mods"]);
  const other = { extraKnownMarketplaces: { "records-mods": { source: { source: "directory", path: "/elsewhere" } } } };
  assert.equal(S.mergeSettings(other, only("extraKnownMarketplaces"), DIR).clashes.length, 1);
});

test("mergeSettings does not mutate existing", () => {
  const ex = { env: { A: "1" }, hooks: { Stop: [{ hooks: [{ type: "command", command: "x.sh" }] }] } };
  const before = clone(ex);
  S.mergeSettings(ex, SNIP, DIR);
  assert.deepEqual(ex, before);
});

test("mergeSettings creates a missing event array with our matcher entry", () => {
  const r = S.mergeSettings({ hooks: { Stop: [] } }, only("hooks"), DIR);
  const pre = r.settings.hooks.PreToolUse;
  assert.equal(pre.length, 1);
  assert.equal(pre[0].matcher, SNIP.hooks.PreToolUse[0].matcher);
  assert.ok(pre[0].hooks[0].command.includes(DIR + "/hooks/session-guard.js"));
});

test("checkSettings: exact after a full merge, extras do not break it", () => {
  const merged = S.mergeSettings({}, SNIP, DIR).settings;
  assert.deepEqual(S.checkSettings(merged, SNIP, DIR), { exact: true, missing: [], different: [] });
  const extra = clone(merged);
  extra.env.MINE = "1"; extra.permissions = {};
  extra.hooks.Stop.push({ hooks: [{ type: "command", command: "echo hi" }] });
  assert.equal(S.checkSettings(extra, SNIP, DIR).exact, true);
});
test("checkSettings lists absent env key as missing and clashes as different", () => {
  const merged = S.mergeSettings({}, SNIP, DIR).settings;
  delete merged.env.CLAUDE_CONTEXT_HANDOFF_THRESHOLD;
  merged.enabledPlugins["records@records-mods"] = false;
  const c = S.checkSettings(merged, SNIP, DIR);
  assert.equal(c.exact, false);
  assert.deepEqual(c.missing, ["env.CLAUDE_CONTEXT_HANDOFF_THRESHOLD"]);
  assert.deepEqual(c.different, ["enabledPlugins.records@records-mods"]);
});

function fixture() {
  const pkg = tmp(), dir = tmp();
  put(pkg, "agreement.md", "A\nB\n");
  put(pkg, "hooks/.hidden", "h\n");
  put(pkg, "hooks/sub/new.js", "n\n");
  put(pkg, "hooks/keep.js", "ours\n");
  put(pkg, "extra.txt", "x");
  put(dir, "CLAUDE.md", "A\r\nB\r\n");
  put(dir, "hooks/keep.js", "theirs\n");
  const manifest = { files: [{ from: "agreement.md", to: "CLAUDE.md" }, { from: "hooks", to: "hooks" }] };
  return { pkg, dir, manifest };
}

test("planFiles sorts files into create, same, differ and unlisted", () => {
  const { pkg, dir, manifest } = fixture();
  const p = S.planFiles(pkg, manifest, dir);
  const rels = (a) => a.map((i) => i.rel).sort();
  assert.deepEqual(rels(p.same), ["CLAUDE.md"]);
  assert.deepEqual(rels(p.differ), ["hooks/keep.js"]);
  assert.deepEqual(rels(p.create), ["hooks/.hidden", "hooks/sub/new.js"]);
  assert.deepEqual(p.unlisted, ["extra.txt"]);
  const c = p.create.find((i) => i.rel === "hooks/sub/new.js");
  assert.equal(path.resolve(c.from), path.resolve(pkg, "hooks/sub/new.js"));
  assert.equal(path.resolve(c.to), path.resolve(dir, "hooks/sub/new.js"));
});

test("applyFiles writes creates (with parent dirs), keeps differ without takeOurs", () => {
  const { pkg, dir, manifest } = fixture();
  const r = S.applyFiles(S.planFiles(pkg, manifest, dir), {});
  assert.deepEqual(r.written.slice().sort(), ["hooks/.hidden", "hooks/sub/new.js"]);
  assert.deepEqual(r.kept, ["hooks/keep.js"]);
  assert.equal(fs.readFileSync(path.join(dir, "hooks/sub/new.js"), "utf8"), "n\n");
  assert.equal(fs.readFileSync(path.join(dir, "hooks/keep.js"), "utf8"), "theirs\n");
  assert.equal(fs.readFileSync(path.join(dir, "CLAUDE.md"), "utf8"), "A\r\nB\r\n");
});
test("applyFiles overwrites a differ item listed in takeOurs", () => {
  const { pkg, dir, manifest } = fixture();
  const r = S.applyFiles(S.planFiles(pkg, manifest, dir), { takeOurs: ["hooks/keep.js"] });
  assert.ok(r.written.includes("hooks/keep.js"));
  assert.deepEqual(r.kept, []);
  assert.equal(fs.readFileSync(path.join(dir, "hooks/keep.js"), "utf8"), "ours\n");
});
