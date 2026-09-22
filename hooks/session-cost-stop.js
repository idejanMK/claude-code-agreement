#!/usr/bin/env node
// Session-cost Stop hook.
// Runs on EVERY stop (never blocks). Sums the token usage of the current
// session's transcript (main + subagent transcripts), prices it at Anthropic
// list rates, and upserts one row keyed by session id into
// <cwd>/project-accounting.json. Opt-in per project: if that file does not
// exist in cwd, the hook does nothing. If HANDOFF.md exists in cwd, a
// "Cost (session, est. API-equivalent):" line is written/refreshed under its
// Date line, so a session that continues after the handoff still updates.
//
// Figures are ESTIMATES at API list price (subscription plans are not billed
// this way). Cache writes are priced at the 5-minute rate (1.25x input).
// Unknown models are counted in tokens but not priced; the row lists them.
//
// Backfill: `node session-cost-stop.js --backfill` from a project root reads
// every transcript of that project and writes rows marked backfilled: true.
// Existing rows are replaced (idempotent).
//
// TO DISABLE: env CLAUDE_SESSION_COST_DISABLED=1, or remove the Stop hook
// entry in ~/.claude/settings.json.

const fs = require("fs");
const path = require("path");
const os = require("os");

// USD per 1M tokens: [input, cache_write(5m), cache_read, output]
const PRICES = [
  ["claude-fable-5-1", [10, 12.5, 0.25, 50]],
  ["claude-mythos-5-1", [10, 12.5, 0.25, 50]],
  ["claude-fable-5", [10, 12.5, 1.0, 50]],
  ["claude-opus-5", [5, 6.25, 0.5, 25]],
  ["claude-opus-4", [5, 6.25, 0.5, 25]],
  ["claude-sonnet-5", [2, 2.5, 0.2, 10]],
  ["claude-sonnet-4-6", [3, 3.75, 0.3, 15]],
  ["claude-haiku-4-5", [1, 1.25, 0.1, 5]],
];

function priceFor(model) {
  const hit = PRICES.find(([sub]) => model.startsWith(sub));
  return hit ? hit[1] : null;
}

function readStdin() {
  try {
    return fs.readFileSync(0, "utf8").replace(/^﻿/, "");
  } catch {
    return "";
  }
}

function readLines(file) {
  try {
    return fs.readFileSync(file, "utf8").split("\n");
  } catch {
    return [];
  }
}

// Collect usage from one transcript file into acc (deduped by message id).
function collect(file, acc, isMain) {
  for (const raw of readLines(file)) {
    const line = raw.replace(/^﻿/, "").trim();
    if (!line) continue;
    let e;
    try {
      e = JSON.parse(line);
    } catch {
      continue;
    }
    const msg = e.message;
    if (!msg || !msg.usage || typeof msg.usage.input_tokens !== "number") continue;
    const model = String(msg.model || "");
    if (!model || model.startsWith("<")) continue;
    const id = msg.id || `${file}:${e.uuid}`;
    // Later lines of the same message carry the final usage; keep the last.
    const cc = msg.usage.cache_creation || {};
    const cw1h = cc.ephemeral_1h_input_tokens || 0;
    acc.byId.set(id, {
      model,
      in: msg.usage.input_tokens || 0,
      cw: Math.max(0, (msg.usage.cache_creation_input_tokens || 0) - cw1h),
      cw1h, // 1-hour cache writes cost 2x input (vs 1.25x for 5-minute)
      cr: msg.usage.cache_read_input_tokens || 0,
      out: msg.usage.output_tokens || 0,
    });
    if (e.timestamp) {
      if (!acc.first || e.timestamp < acc.first) acc.first = e.timestamp;
      if (!acc.last || e.timestamp > acc.last) acc.last = e.timestamp;
      if (isMain) acc.ts.push(Date.parse(e.timestamp));
    }
    if (isMain && e.cwd && !acc.cwd) acc.cwd = e.cwd;
    if (isMain && e.gitBranch && !acc.branches.includes(e.gitBranch)) acc.branches.push(e.gitBranch);
  }
}

function summarize(sessionId, transcriptPath) {
  const acc = { byId: new Map(), first: null, last: null, branches: [], ts: [], cwd: null };
  collect(transcriptPath, acc, true);
  const subDir = path.join(path.dirname(transcriptPath), sessionId, "subagents");
  let subFiles = [];
  try {
    subFiles = fs.readdirSync(subDir).filter((n) => n.endsWith(".jsonl"));
  } catch {}
  for (const n of subFiles) collect(path.join(subDir, n), acc, false);

  const models = {};
  const unpriced = new Set();
  let usd = 0;
  let total = 0;
  for (const u of acc.byId.values()) {
    const m = (models[u.model] ||= { turns: 0, input: 0, cache_write: 0, cache_read: 0, output: 0, est_usd: null });
    m.turns++;
    m.input += u.in;
    m.cache_write += u.cw + u.cw1h;
    m.cache_read += u.cr;
    m.output += u.out;
    total += u.in + u.cw + u.cw1h + u.cr + u.out;
    const p = priceFor(u.model);
    if (!p) {
      unpriced.add(u.model);
      continue;
    }
    const c = (u.in * p[0] + u.cw * p[1] + u.cw1h * p[1] * 1.6 + u.cr * p[2] + u.out * p[3]) / 1e6;
    m.est_usd = (m.est_usd || 0) + c;
    usd += c;
  }
  for (const m of Object.values(models)) if (m.est_usd !== null) m.est_usd = +m.est_usd.toFixed(2);

  // Active time = sum of gaps between consecutive main-transcript turns,
  // each gap capped at 15 minutes (a longer gap counts as a break).
  acc.ts.sort((a, b) => a - b);
  let activeMs = 0;
  for (let i = 1; i < acc.ts.length; i++) activeMs += Math.min(acc.ts[i] - acc.ts[i - 1], 15 * 60 * 1000);

  return {
    session_id: sessionId,
    cwd: acc.cwd,
    active_hours: +(activeMs / 3.6e6).toFixed(2),
    date: acc.first ? acc.first.slice(0, 10) : null,
    started: acc.first,
    last_activity: acc.last,
    branches: acc.branches,
    turns: acc.byId.size,
    subagent_transcripts: subFiles.length,
    tokens_total: total,
    est_usd: +usd.toFixed(2),
    unpriced_models: [...unpriced],
    models,
  };
}

function upsert(ledgerPath, row) {
  let ledger;
  try {
    ledger = JSON.parse(fs.readFileSync(ledgerPath, "utf8").replace(/^﻿/, ""));
  } catch {
    ledger = {};
  }
  if (!Array.isArray(ledger.sessions)) ledger.sessions = [];
  ledger.note ||=
    "Estimated cost at Anthropic API list price, per session (main + subagents). Machine-written by ~/.claude/hooks/session-cost-stop.js; do not hand-edit.";
  const i = ledger.sessions.findIndex((s) => s.session_id === row.session_id);
  if (i >= 0) row = { ...ledger.sessions[i], ...row };
  else ledger.sessions.push(row);
  if (i >= 0) ledger.sessions[i] = row;
  ledger.sessions.sort((a, b) => String(a.started || "").localeCompare(String(b.started || "")));
  ledger.total_est_usd = +ledger.sessions.reduce((s, r) => s + (r.est_usd || 0), 0).toFixed(2);
  fs.writeFileSync(ledgerPath, JSON.stringify(ledger, null, 2) + "\n");
}

function stampHandoff(cwd, row) {
  const p = path.join(cwd, "HANDOFF.md");
  let text;
  try {
    text = fs.readFileSync(p, "utf8");
  } catch {
    return;
  }
  const modelsStr = Object.entries(row.models)
    .map(([m, v]) => `${m.replace(/^claude-/, "")} ${v.turns}t`)
    .join(", ");
  const line = `Cost (session, est. API-equivalent): $${row.est_usd.toFixed(2)} · ${Math.round(row.tokens_total / 1000)}k tokens · ${modelsStr}`;
  // Function replacers: `line` contains "$1.96", which a string replacer
  // would read as a backreference. [^\r\n]* keeps CRLF files intact.
  const re = /^Cost \(session, est\. API-equivalent\):[^\r\n]*/m;
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  let out;
  if (re.test(text)) out = text.replace(re, () => line);
  else if (/^Date:[^\r\n]*/m.test(text)) out = text.replace(/^Date:[^\r\n]*/m, (d) => `${d}${eol}${line}`);
  else out = `${line}${eol}${text}`;
  if (out !== text) fs.writeFileSync(p, out);
}

function projectTranscriptDir(cwd) {
  // Claude Code names the transcript folder by replacing EVERY non-alphanumeric
  // character of the cwd with "-" (spaces and underscores included, not just : \ /).
  return path.join(os.homedir(), ".claude", "projects", cwd.replace(/[^A-Za-z0-9]/g, "-"));
}

function backfill() {
  const cwd = process.cwd();
  const ledgerPath = path.join(cwd, "project-accounting.json");
  const dir = projectTranscriptDir(cwd);
  const files = fs.readdirSync(dir).filter((n) => n.endsWith(".jsonl"));
  for (const n of files) {
    const id = n.replace(/\.jsonl$/, "");
    const row = summarize(id, path.join(dir, n));
    if (!row.turns) continue;
    row.backfilled = true;
    upsert(ledgerPath, row);
    console.log(`${row.date}  $${row.est_usd.toFixed(2).padStart(7)}  ${row.branches.join(",") || "-"}  ${id}`);
  }
}

function main() {
  if (process.env.CLAUDE_SESSION_COST_DISABLED === "1") return;
  if (process.argv.includes("--backfill")) return backfill();
  let input;
  try {
    input = JSON.parse(readStdin() || "{}");
  } catch {
    return;
  }
  const cwd = input.cwd || process.cwd();
  const ledgerPath = path.join(cwd, "project-accounting.json");
  if (!fs.existsSync(ledgerPath)) return; // project not opted in
  const transcriptPath = input.transcript_path;
  if (!transcriptPath) return;
  const sessionId = input.session_id || path.basename(transcriptPath).replace(/\.jsonl$/, "");
  const row = summarize(sessionId, transcriptPath);
  if (!row.turns) return;
  upsert(ledgerPath, row);
  stampHandoff(cwd, row);
}

if (require.main === module) {
  try {
    main();
  } catch {
    // fail open: a cost hook must never break a stop
  }
} else {
  module.exports = { summarize, projectTranscriptDir };
}
