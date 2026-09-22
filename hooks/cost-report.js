#!/usr/bin/env node
// Cross-project cost report from Claude Code transcripts (~/.claude/projects).
//   node ~/.claude/hooks/cost-report.js            # all projects, to stdout
//   node ~/.claude/hooks/cost-report.js --md FILE  # also write Markdown
//   node ~/.claude/hooks/cost-report.js --project aiccount   # one project's detail
// Plan price: env CLAUDE_PLAN_USD_MONTH (default 100 = Max 5x).
//
// Method (all figures are estimates):
// - API-equivalent USD = tokens x Anthropic list price (see session-cost-stop.js).
// - Subscription USD allocated to a project = each month's plan price split
//   across projects pro rata to their API-equivalent USD that month. A session
//   is dated by its first turn. Partial months allocate the full month price.
// - Active hours = gaps between consecutive turns, each capped at 15 minutes.
// - Transcripts age out (cleanupPeriodDays), so the window is what is on disk.

const fs = require("fs");
const path = require("path");
const os = require("os");
const { execFileSync } = require("child_process");
const { summarize } = require("./session-cost-stop.js");

const PLAN = Number(process.env.CLAUDE_PLAN_USD_MONTH || 100);
const args = process.argv.slice(2);
const mdOut = args.includes("--md") ? args[args.indexOf("--md") + 1] : null;
const only = args.includes("--project") ? args[args.indexOf("--project") + 1] : null;

const root = path.join(os.homedir(), ".claude", "projects");
const projects = {}; // name -> {sessions, cwd}
for (const d of fs.readdirSync(root)) {
  const dir = path.join(root, d);
  let files;
  try {
    files = fs.readdirSync(dir).filter((n) => n.endsWith(".jsonl"));
  } catch {
    continue;
  }
  const rows = files.map((n) => summarize(n.replace(/\.jsonl$/, ""), path.join(dir, n))).filter((r) => r.turns && r.date);
  if (!rows.length) continue;
  const cwd = rows.find((r) => r.cwd)?.cwd || null;
  const name = cwd ? path.basename(cwd) : d.replace(/^.--/, "").split("-").pop();
  const p = (projects[name] ||= { name, cwd, sessions: [] });
  p.sessions.push(...rows);
}

// Monthly allocation of the plan price.
const monthTotals = {}; // month -> total api-eq across projects
for (const p of Object.values(projects))
  for (const s of p.sessions) monthTotals[s.date.slice(0, 7)] = (monthTotals[s.date.slice(0, 7)] || 0) + s.est_usd;

function gitStats(cwd, since, until) {
  if (!cwd) return null;
  try {
    const opt = { stdio: ["ignore", "pipe", "ignore"] };
    const range = [`--since=${since}`, `--until=${until}`];
    const commits = Number(execFileSync("git", ["-C", cwd, "rev-list", "--count", "HEAD", ...range], opt).toString().trim());
    let added = 0, deleted = 0;
    for (const line of execFileSync("git", ["-C", cwd, "log", "--numstat", "--format=", ...range], opt).toString().split("\n")) {
      const m = /^(\d+)\t(\d+)\t/.exec(line); // binary files show "-", skipped
      if (m) { added += +m[1]; deleted += +m[2]; }
    }
    return { commits, added, deleted };
  } catch {
    return null;
  }
}

function agg(p) {
  const k = { input: 0, cache_write: 0, cache_read: 0, output: 0 };
  const models = {};
  let usd = 0, hours = 0, turns = 0;
  const months = {};
  for (const s of p.sessions) {
    usd += s.est_usd;
    hours += s.active_hours;
    turns += s.turns;
    const mo = s.date.slice(0, 7);
    months[mo] = (months[mo] || 0) + s.est_usd;
    for (const [m, v] of Object.entries(s.models)) {
      for (const key in k) k[key] += v[key];
      const mm = (models[m] ||= { turns: 0, est_usd: 0 });
      mm.turns += v.turns;
      mm.est_usd += v.est_usd || 0;
    }
  }
  let alloc = 0;
  for (const [mo, v] of Object.entries(months)) if (monthTotals[mo] > 0) alloc += (PLAN * v) / monthTotals[mo];
  const tokens = Object.values(k).reduce((a, b) => a + b, 0);
  const dates = p.sessions.map((s) => s.date).sort();
  const first = dates[0], last = p.sessions.map((s) => (s.last_activity || s.started).slice(0, 10)).sort().pop();
  const git = gitStats(p.cwd, first, last + "T23:59:59");
  return { name: p.name, first, last, sessions: p.sessions.length, turns, hours, tokens, k, models, usd, alloc, months, git };
}

const rows = Object.values(projects).map(agg).sort((a, b) => b.usd - a.usd);
const grand = rows.reduce((g, r) => ({ usd: g.usd + r.usd, alloc: g.alloc + r.alloc, tokens: g.tokens + r.tokens, hours: g.hours + r.hours }), { usd: 0, alloc: 0, tokens: 0, hours: 0 });

const $ = (n) => "$" + n.toFixed(n >= 100 ? 0 : 2);
const M = (n) => (n / 1e6).toFixed(0) + "M";
const perM = (usd, tok) => (tok > 0 ? "$" + (usd / (tok / 1e6)).toFixed(3) : "-");
const perK = (usd, lines) => (lines > 0 ? $((1000 * usd) / lines) : "-");
const perH = (usd, h) => (h > 0 ? "$" + (usd / h).toFixed(1) : "-");

const out = [];
const L = (s = "") => out.push(s);
L(`# Claude Code cost report — ${new Date().toISOString().slice(0, 10)}`);
L(`Plan: $${PLAN}/month. Window on disk: ${Object.keys(monthTotals).sort()[0]} → ${Object.keys(monthTotals).sort().pop()}. All figures are estimates (see method in cost-report.js).`);
L();
L(`| Project | Sessions | Active h | Tokens | API-eq | Sub. alloc | Sub. $/M tok | Sub. $/h | API-eq $/h | Commits | LoC +/- | Sub. $/kLoC |`);
L(`|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|`);
for (const r of rows.filter((r) => !only || r.name.includes(only)))
  L(`| ${r.name} | ${r.sessions} | ${r.hours.toFixed(1)} | ${M(r.tokens)} | ${$(r.usd)} | ${$(r.alloc)} | ${perM(r.alloc, r.tokens)} | ${perH(r.alloc, r.hours)} | ${perH(r.usd, r.hours)} | ${r.git ? r.git.commits : "-"} | ${r.git ? `+${r.git.added}/-${r.git.deleted}` : "-"} | ${perK(r.alloc, r.git?.added || 0)} |`);
L(`| **All** | ${rows.reduce((a, r) => a + r.sessions, 0)} | ${grand.hours.toFixed(1)} | ${M(grand.tokens)} | ${$(grand.usd)} | ${$(grand.alloc)} | ${perM(grand.alloc, grand.tokens)} | ${perH(grand.alloc, grand.hours)} | ${perH(grand.usd, grand.hours)} | ${rows.reduce((a, r) => a + (r.git?.commits || 0), 0)} | +${rows.reduce((a, r) => a + (r.git?.added || 0), 0)}/-${rows.reduce((a, r) => a + (r.git?.deleted || 0), 0)} | ${perK(grand.alloc, rows.reduce((a, r) => a + (r.git?.added || 0), 0))} |`);
L();
L(`Reading the columns: "Sub. alloc" is the share of the subscription this project consumed. "Sub. $/h" is what an active hour of Claude actually cost you; "API-eq $/h" is what it would cost pay-as-you-go. Compare both with a contractor's hourly rate. "LoC +/-" is lines added/deleted in git over the window (all authors, generated files included); "Sub. $/kLoC" is subscription dollars per 1,000 lines added.`);
L();
L(`## By month (API-eq → subscription share)`);
L();
const monthsSorted = Object.keys(monthTotals).sort();
L(`| Project | ${monthsSorted.join(" | ")} |`);
L(`|---|${monthsSorted.map(() => "---:").join("|")}|`);
for (const r of rows.filter((r) => !only || r.name.includes(only)))
  L(`| ${r.name} | ${monthsSorted.map((mo) => (r.months[mo] ? `${$(r.months[mo])} → ${$((PLAN * r.months[mo]) / monthTotals[mo])}` : "")).join(" | ")} |`);
L(`| month total | ${monthsSorted.map((mo) => $(monthTotals[mo])).join(" | ")} |`);
L();
for (const r of rows.filter((r) => !only || r.name.includes(only))) {
  L(`## ${r.name} — ${r.first} → ${r.last}`);
  L();
  L(`- Token mix: input ${M(r.k.input)}, cache write ${M(r.k.cache_write)}, cache read ${M(r.k.cache_read)} (${((100 * r.k.cache_read) / r.tokens).toFixed(0)}%), output ${M(r.k.output)}`);
  L(`- List-price $/M tokens: ${perM(r.usd, r.tokens)} · subscription $/M tokens: ${perM(r.alloc, r.tokens)} · discount vs list: ${(r.usd / r.alloc).toFixed(0)}x`);
  L(`- Per session: ${$(r.usd / r.sessions)} API-eq, ${(r.hours / r.sessions).toFixed(1)} active h, ${Math.round(r.turns / r.sessions)} turns` + (r.git?.commits ? ` · per commit: ${$(r.alloc / r.git.commits)} sub / ${$(r.usd / r.git.commits)} API-eq · ${Math.round(r.git.added / r.git.commits)} lines added per commit` : ""));
  L(`- Models: ` + Object.entries(r.models).sort((a, b) => b[1].est_usd - a[1].est_usd).map(([m, v]) => `${m.replace(/^claude-/, "")} ${$(v.est_usd)} (${v.turns}t)`).join(", "));
  L();
}

const text = out.join("\n");
console.log(text);
if (mdOut) fs.writeFileSync(mdOut, text + "\n");
