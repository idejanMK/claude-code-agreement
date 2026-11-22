#!/usr/bin/env node
// records-lint.js — the records grammar as code (~/.claude/rules/records.md).
// Checks PLAN.md, ROADMAP.md, NOTES.md, records/notes-log.md and every
// records/phases/<n>.<k>.md of one project. Deterministic; no model call.
//
//   node records-lint.js [project root]   → prints problems, exit 1 if any, "records: ok" otherwise
//   node records-lint.js --hook           → PostToolUse: reads the hook JSON on stdin; when the
//                                           edited file is a record, lints the project and, on
//                                           problems, answers {"decision":"block","reason":…}
//                                           so the editor sees what to fix. Fails open.
// A project without PLAN.md, or whose PLAN.md is not the dashboard shape (no
// "## Open phase" heading), is skipped: the old grammar is not linted.

const fs = require("fs");
const path = require("path");

const read = (p) => { try { return fs.readFileSync(p, "utf8").replace(/^﻿/, ""); } catch { return null; } };
const lines = (s) => s.split(/\r\n|\n/);

function lint(root) {
  const problems = [];
  const P = (file, msg) => problems.push(`${file}: ${msg}`);

  // ── PLAN.md ────────────────────────────────────────────────────────────────
  const plan = read(path.join(root, "PLAN.md"));
  if (plan === null) return { skipped: "no PLAN.md" };
  if (!/^## Open phase\s*$/m.test(plan)) return { skipped: "PLAN.md is not the dashboard shape" };
  const pl = lines(plan);
  if (pl.length > 30) P("PLAN.md", `${pl.length} lines; the dashboard is at most 30 (task text lives in the phase file)`);
  const heads = pl.filter((l) => /^#{1,3} /.test(l));
  const want = ["# PLAN — ", "## At a glance", "## Open phase"];
  if (heads.length !== 3 || !heads[0].startsWith(want[0]) || heads[1] !== want[1] || heads[2] !== want[2])
    P("PLAN.md", `headings must be exactly "${want.join('" · "')}" (found: ${heads.join(" | ") || "none"})`);
  for (const k of ["Branch", "Now", "Your turn", "Blocked on"])
    if (!pl.some((l) => l.startsWith(`- **${k}:**`))) P("PLAN.md", `At a glance is missing "- **${k}:**"`);
  const pf = plan.match(/^- \*\*Phase file:\*\*\s*(none|\[[^\]]*\]\((records\/phases\/(\d+\.\d+)\.md)\))/m);
  let openId = null;
  if (!pf) P("PLAN.md", 'Open phase needs "- **Phase file:** none" or a link to records/phases/<n>.<k>.md');
  else if (pf[1] !== "none") {
    openId = pf[3];
    const f = read(path.join(root, pf[2]));
    if (f === null) P("PLAN.md", `Phase file ${pf[2]} does not exist`);
    else if (!/^- \*\*Status:\*\* open since \d{4}-\d{2}-\d{2}\s*$/m.test(f))
      P("PLAN.md", `Phase file ${pf[2]} is linked as open but its Status is not "open since <date>"`);
  }

  // ── records/phases/*.md ────────────────────────────────────────────────────
  const dir = path.join(root, "records", "phases");
  let files = [];
  try { files = fs.readdirSync(dir).filter((n) => n.endsWith(".md") && !n.startsWith("_")); } catch {}
  const FIELDS = ["Status", "Why", "Scope", "Verify", "Your part", "Evidence", "Keepers", "Deps"];
  const STATUS = /^- \*\*Status:\*\* (proposed|open since \d{4}-\d{2}-\d{2}|closed \d{4}-\d{2}-\d{2}|dropped — .+)\s*$/m;
  const TASK_STATUS = /^- \*\*Status:\*\* (todo|building|built|✅ verified \d{4}-\d{2}-\d{2} by .+|✗ dropped — .+)\s*$/;
  let openCount = 0;
  for (const n of files) {
    const file = `records/phases/${n}`;
    const idm = n.match(/^(\d+)\.(\d+)\.md$/);
    if (!idm) { P(file, "file name must be <n>.<k>.md"); continue; }
    const id = `${idm[1]}.${idm[2]}`;
    const t = read(path.join(dir, n));
    const tl = lines(t);
    if (!tl[0].startsWith(`# ${id} — `)) P(file, `first line must be "# ${id} — <title>"`);
    for (const k of ["Milestone", "Status", "Branch", "Gate 1"])
      if (!tl.some((l) => l.startsWith(`- **${k}:**`))) P(file, `header is missing "- **${k}:**"`);
    if (!STATUS.test(t)) P(file, "Status must be proposed | open since <date> | closed <date> | dropped — <reason>");
    if (/^- \*\*Status:\*\* open since/m.test(t)) { openCount++; if (openId !== id) P(file, `is open but PLAN.md's Phase file is ${openId || "none"}`); }
    const mm = t.match(/^- \*\*Milestone:\*\* M(\d+)/m);
    if (mm && mm[1] !== idm[1]) P(file, `Milestone M${mm[1]} does not match the phase id ${id}`);
    for (const h of ["## Why", "## Scope", "## Tasks", "## Task details", "## Context", "## Open user items", "## Closure"])
      if (!tl.some((l) => l.trim() === h)) P(file, `missing section "${h}"`);
    // tasks: table rows vs detail headings
    const tableIds = [...t.matchAll(/^\| (\d+\.\d+\.\d+) \|/gm)].map((m) => m[1]);
    const detail = [...t.matchAll(/^### (\d+\.\d+\.\d+) — .+$/gm)].map((m) => m[1]);
    const seen = new Set();
    for (const d of detail) {
      if (!d.startsWith(id + ".")) P(file, `task ${d} does not belong to phase ${id}`);
      if (seen.has(d)) P(file, `task ${d} appears twice`);
      seen.add(d);
      if (!tableIds.includes(d)) P(file, `task ${d} has details but no row in ## Tasks`);
    }
    for (const r of tableIds) if (!detail.includes(r)) P(file, `task ${r} is in the table but has no "### ${r} — …" details`);
    // each task block: the eight fields, in order, each once
    const blocks = t.split(/^### (?=\d+\.\d+\.\d+ — )/m).slice(1);
    for (const b of blocks) {
      const tid = b.match(/^(\d+\.\d+\.\d+)/)[1];
      const body = b.split(/^#{2,3} (?!\d)/m)[0];
      const order = [];
      for (const l of lines(body)) { const m = l.match(/^- \*\*([A-Za-z ]+):\*\*/); if (m) order.push(m[1]); }
      const fields = order.filter((f) => FIELDS.includes(f));
      if (fields.join("|") !== FIELDS.join("|")) P(file, `task ${tid}: fields must be exactly ${FIELDS.join(" · ")} in that order (found: ${order.join(" · ") || "none"})`);
      const unknown = order.filter((f) => !FIELDS.includes(f));
      if (unknown.length) P(file, `task ${tid}: unknown field(s) ${unknown.join(", ")}`);
      const st = lines(body).find((l) => l.startsWith("- **Status:**"));
      if (st && !TASK_STATUS.test(st)) P(file, `task ${tid}: Status must be todo | building | built | ✅ verified <date> by <who> | ✗ dropped — <reason>`);
    }
    // newest first: detail headings in descending task number
    const nums = detail.map((d) => Number(d.split(".")[2]));
    for (let i = 1; i < nums.length; i++) if (nums[i] > nums[i - 1]) { P(file, "task details must be newest first (descending IDs)"); break; }
  }
  if (openCount > 1) P("records/phases", `${openCount} phases are open; one at a time`);

  // ── ROADMAP.md ─────────────────────────────────────────────────────────────
  const rm = read(path.join(root, "ROADMAP.md"));
  if (rm === null) P("ROADMAP.md", "missing");
  else {
    for (const h of ["## Milestones", "## Decisions", "## Backlog", "## Gotchas"])
      if (!new RegExp(`^${h}\\s*$`, "m").test(rm)) P("ROADMAP.md", `missing section "${h}"`);
    const uniq = (re, what) => {
      const ids = [...rm.matchAll(re)].map((m) => m[1]);
      const dup = ids.filter((x, i) => ids.indexOf(x) !== i);
      if (dup.length) P("ROADMAP.md", `${what} ${[...new Set(dup)].join(", ")} appear(s) more than once`);
      return ids;
    };
    uniq(/^## (M\d+) — /gm, "milestone");
    const ds = uniq(/^#### (D\d+) — /gm, "decision").map((d) => Number(d.slice(1)));
    for (let i = 1; i < ds.length; i++) if (ds[i] > ds[i - 1]) { P("ROADMAP.md", "decision log must be newest first (descending D numbers)"); break; }
    uniq(/^- (B\d+) \(/gm, "backlog item");
    for (const m of rm.matchAll(/^\| (\d+)\.(\d+) \|.*$/gm)) {
      const before = rm.slice(0, m.index);
      const ms = [...before.matchAll(/^## M(\d+) — /gm)].pop();
      if (ms && ms[1] !== m[1]) P("ROADMAP.md", `phase row ${m[1]}.${m[2]} sits under M${ms[1]}`);
    }
  }

  // ── NOTES.md + records/notes-log.md ────────────────────────────────────────
  const notes = read(path.join(root, "NOTES.md"));
  const log = read(path.join(root, "records", "notes-log.md")) || "";
  if (notes === null) P("NOTES.md", "missing (the only inbox)");
  else {
    const inbox = [...notes.matchAll(/^- (?:\? )?(N\d+) \(\d{4}-\d{2}-\d{2}\) /gm)].map((m) => m[1]);
    const logged = [...log.matchAll(/^- (N\d+) \(\d{4}-\d{2}-\d{2}\) .* (→|✗) /gm)].map((m) => m[1]);
    const all = [...inbox, ...logged];
    const dup = all.filter((x, i) => all.indexOf(x) !== i);
    if (dup.length) P("NOTES.md", `note id(s) ${[...new Set(dup)].join(", ")} appear in more than one place`);
    for (const l of lines(notes)) if (/^- /.test(l) && !/^- (\? )?N\d+ \(\d{4}-\d{2}-\d{2}\) /.test(l)) P("NOTES.md", `line does not follow "- N<n> (YYYY-MM-DD) text": ${l.slice(0, 60)}`);
  }
  return { problems };
}

function main() {
  const argv = process.argv.slice(2);
  if (argv[0] === "--hook") {
    try {
      const input = JSON.parse(fs.readFileSync(0, "utf8").replace(/^﻿/, "") || "{}");
      const fp = String((input.tool_input || {}).file_path || "").replace(/\\/g, "/");
      if (!/(^|\/)(PLAN|ROADMAP|NOTES)\.md$|\/records\/(phases\/[^/]+|notes-log)\.md$/.test(fp)) return;
      let root = path.dirname(fp);
      while (root && !fs.existsSync(path.join(root, "PLAN.md")) && path.dirname(root) !== root) root = path.dirname(root);
      const r = lint(root);
      if (r.problems && r.problems.length)
        console.log(JSON.stringify({ decision: "block", reason: "records-lint: the record no longer follows the grammar (~/.claude/rules/records.md). Fix these, then continue:\n- " + r.problems.join("\n- ") }));
    } catch {}
    return;
  }
  const root = path.resolve(argv[0] || process.cwd());
  const r = lint(root);
  if (r.skipped) { console.log(`records: skipped (${r.skipped})`); return; }
  if (r.problems.length) { console.log("records: " + r.problems.length + " problem(s)\n- " + r.problems.join("\n- ")); process.exit(1); }
  console.log("records: ok");
}

module.exports = { lint };
if (require.main === module) main();
