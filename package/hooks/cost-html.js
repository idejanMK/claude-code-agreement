#!/usr/bin/env node
// Generates <cwd>/project-accounting.html from <cwd>/project-accounting.json
// (written by session-cost-stop.js). Meant to be run as a Claude Code Stop
// hook: it must never fail the stop, so every error path exits 0 silently.
//
// Usage: node cost-html.js [--cwd DIR]

const fs = require("fs");
const path = require("path");

function getCwd() {
  const i = process.argv.indexOf("--cwd");
  if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1];
  return process.cwd();
}

function fmtUsd(n) {
  n = Number(n) || 0;
  return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtHours(n) {
  return Number(n || 0).toFixed(1) + " h";
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// ISO week label like "2026-W37" for a given Date (UTC-based ISO 8601 week).
function isoWeekLabel(d) {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = (date.getUTCDay() + 6) % 7; // Mon=0..Sun=6
  date.setUTCDate(date.getUTCDate() - day + 3); // Thursday of this week
  const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
  const firstDay = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDay + 3);
  const week = 1 + Math.round((date - firstThursday) / (7 * 86400000));
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

// Monday (UTC) of the ISO week containing d — used to enumerate the
// contiguous week range so empty weeks show up too.
function isoWeekMonday(d) {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - day);
  return date;
}

function buildHtml(data, projectName) {
  const sessions = Array.isArray(data.sessions) ? data.sessions : [];
  const totalUsd = Number(data.total_est_usd) || 0;
  const note = typeof data.note === "string" ? data.note : "";

  const sessionCount = sessions.length;
  const totalHours = sessions.reduce((s, r) => s + (Number(r.active_hours) || 0), 0);
  const usdPerHour = totalHours > 0 ? totalUsd / totalHours : null;

  // ---- Cost by week ----
  const weekMap = new Map(); // label -> usd
  let minMonday = null, maxMonday = null;
  for (const s of sessions) {
    if (!s.started) continue;
    const d = new Date(s.started);
    if (isNaN(d)) continue;
    const label = isoWeekLabel(d);
    weekMap.set(label, (weekMap.get(label) || 0) + (Number(s.est_usd) || 0));
    const mon = isoWeekMonday(d);
    if (!minMonday || mon < minMonday) minMonday = mon;
    if (!maxMonday || mon > maxMonday) maxMonday = mon;
  }
  const weeks = [];
  if (minMonday && maxMonday) {
    let cur = new Date(minMonday);
    while (cur <= maxMonday) {
      const label = isoWeekLabel(cur);
      weeks.push({ label, usd: weekMap.get(label) || 0 });
      cur.setUTCDate(cur.getUTCDate() + 7);
    }
  }

  // ---- Cost by model ----
  const modelMap = new Map(); // model -> { turns, est_usd }
  for (const s of sessions) {
    const models = s.models || {};
    for (const [name, m] of Object.entries(models)) {
      const entry = modelMap.get(name) || { turns: 0, est_usd: 0 };
      entry.turns += Number(m.turns) || 0;
      entry.est_usd += m.est_usd === null || m.est_usd === undefined ? 0 : Number(m.est_usd);
      modelMap.set(name, entry);
    }
  }
  const unpriced = new Set();
  for (const s of sessions) for (const m of s.unpriced_models || []) unpriced.add(m);
  const modelRows = [...modelMap.entries()]
    .map(([name, v]) => ({ name, turns: v.turns, est_usd: v.est_usd, unpriced: unpriced.has(name) }))
    .sort((a, b) => b.est_usd - a.est_usd);
  const modelTotal = modelRows.reduce((s, r) => s + r.est_usd, 0);

  // ---- Sessions table ----
  const sessionRows = sessions
    .map((s) => {
      const started = s.started ? new Date(s.started) : null;
      return {
        date: s.date || (started ? started.toISOString().slice(0, 10) : ""),
        started_iso: s.started || "",
        started_time: started && !isNaN(started) ? started.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "",
        branches: Array.isArray(s.branches) ? s.branches.join(", ") : "",
        turns: Number(s.turns) || 0,
        subagent_transcripts: Number(s.subagent_transcripts) || 0,
        active_hours: Number(s.active_hours) || 0,
        est_usd: Number(s.est_usd) || 0,
        backfilled: !!s.backfilled,
      };
    })
    .sort((a, b) => String(b.started_iso).localeCompare(String(a.started_iso)));

  // ---- Chart geometry (single-series bar chart: cost by week) ----
  const chartW = 900, chartH = 220, padL = 48, padR = 12, padT = 12, padB = 28;
  const plotW = chartW - padL - padR, plotH = chartH - padT - padB;
  const maxUsd = Math.max(1, ...weeks.map((w) => w.usd));
  const n = Math.max(1, weeks.length);
  const slot = plotW / n;
  const barW = Math.min(24, Math.max(4, slot * 0.6));
  const gap = 2; // surface gap between adjacent bars/marks

  let bars = "";
  let xLabels = "";
  weeks.forEach((w, i) => {
    const cx = padL + slot * i + slot / 2;
    const h = w.usd > 0 ? Math.max(2, (w.usd / maxUsd) * plotH) : 0;
    const x = cx - barW / 2 + gap / 2;
    const w2 = Math.max(1, barW - gap);
    const y = padT + plotH - h;
    if (h > 0) {
      bars += `<rect class="bar" x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w2.toFixed(1)}" height="${h.toFixed(1)}" rx="4" ry="4"><title>${escapeHtml(w.label)}: ${fmtUsd(w.usd)}</title></rect>`;
    } else {
      // empty week: a faint baseline tick so the time axis stays honest
      bars += `<rect class="bar-empty" x="${x.toFixed(1)}" y="${(padT + plotH - 2).toFixed(1)}" width="${w2.toFixed(1)}" height="2"><title>${escapeHtml(w.label)}: no sessions</title></rect>`;
    }
    // show every label if few weeks, else thin them out
    const showLabel = n <= 14 || i % Math.ceil(n / 14) === 0;
    if (showLabel) {
      xLabels += `<text class="axis-label" x="${cx.toFixed(1)}" y="${(chartH - 8).toFixed(1)}" text-anchor="middle">${escapeHtml(w.label.replace(/^\d{4}-/, ""))}</text>`;
    }
  });
  // y-axis ticks: 0 and max, rounded
  const yTicks = [0, maxUsd];
  let yLabels = "";
  let gridLines = "";
  for (const t of yTicks) {
    const y = padT + plotH - (t / maxUsd) * plotH;
    yLabels += `<text class="axis-label" x="${(padL - 6).toFixed(1)}" y="${(y + 4).toFixed(1)}" text-anchor="end">${fmtUsd(t)}</text>`;
    gridLines += `<line class="gridline" x1="${padL}" y1="${y.toFixed(1)}" x2="${chartW - padR}" y2="${y.toFixed(1)}"/>`;
  }

  const svg = weeks.length
    ? `<svg viewBox="0 0 ${chartW} ${chartH}" role="img" aria-label="Estimated cost by ISO week" preserveAspectRatio="xMidYMid meet">
        ${gridLines}
        ${bars}
        ${xLabels}
        ${yLabels}
      </svg>`
    : `<p class="empty-note">No sessions to chart.</p>`;

  const modelRowsHtml = modelRows
    .map((r) => {
      const share = modelTotal > 0 ? ((r.est_usd / modelTotal) * 100).toFixed(1) : "0.0";
      return `<tr>
        <td>${escapeHtml(r.name)}${r.unpriced ? ' <span class="tag" title="Tokens counted but this model is not in the pricing table">not priced</span>' : ""}</td>
        <td class="num">${r.turns}</td>
        <td class="num">${fmtUsd(r.est_usd)}</td>
        <td class="num">${share}%</td>
      </tr>`;
    })
    .join("\n");

  const sessionRowsHtml = sessionRows
    .map(
      (r) => `<tr>
        <td data-sort="${escapeHtml(r.date)}">${escapeHtml(r.date)}</td>
        <td data-sort="${escapeHtml(r.started_iso)}">${escapeHtml(r.started_time)}</td>
        <td class="num" data-sort="${r.est_usd}">${fmtUsd(r.est_usd)}${r.backfilled ? ' <span class="dot" title="Reconstructed from the transcript (backfilled)">●</span>' : ""}</td>
        <td class="num" data-sort="${r.active_hours}">${fmtHours(r.active_hours)}</td>
        <td class="num" data-sort="${r.turns}">${r.turns}</td>
        <td class="num" data-sort="${r.subagent_transcripts}">${r.subagent_transcripts}</td>
        <td class="branches-cell" data-sort="${escapeHtml(r.branches)}">${escapeHtml(r.branches)}</td>
      </tr>`
    )
    .join("\n");

  const generated = new Date().toISOString();

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(projectName)} — session cost</title>
<style>
  :root {
    color-scheme: light;
    --surface-1:      #fcfcfb;
    --page:           #f9f9f7;
    --text-primary:   #0b0b0b;
    --text-secondary: #52514e;
    --text-muted:     #898781;
    --gridline:       #e1e0d9;
    --baseline:       #c3c2b7;
    --border:         rgba(11,11,11,0.10);
    --series-1:       #2a78d6;
    --tag-bg:         #eda100;
    --tag-fg:         #0b0b0b;
  }
  @media (prefers-color-scheme: dark) {
    :root:where(:not([data-theme="light"])) {
      color-scheme: dark;
      --surface-1:      #1a1a19;
      --page:           #0d0d0d;
      --text-primary:   #ffffff;
      --text-secondary: #c3c2b7;
      --text-muted:     #898781;
      --gridline:       #2c2c2a;
      --baseline:       #383835;
      --border:         rgba(255,255,255,0.10);
      --series-1:       #3987e5;
      --tag-bg:         #c98500;
      --tag-fg:         #0b0b0b;
    }
  }
  :root[data-theme="dark"] {
    color-scheme: dark;
    --surface-1:      #1a1a19;
    --page:           #0d0d0d;
    --text-primary:   #ffffff;
    --text-secondary: #c3c2b7;
    --text-muted:     #898781;
    --gridline:       #2c2c2a;
    --baseline:       #383835;
    --border:         rgba(255,255,255,0.10);
    --series-1:       #3987e5;
    --tag-bg:         #c98500;
    --tag-fg:         #0b0b0b;
  }
  * { box-sizing: border-box; }
  html, body {
    margin: 0;
    background: var(--page);
    color: var(--text-primary);
    font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
    font-size: 14px;
    overflow-x: hidden;
  }
  body { padding: 24px; max-width: 1000px; margin: 0 auto; }
  header { margin-bottom: 20px; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  .meta { color: var(--text-secondary); font-size: 13px; }
  .note { color: var(--text-muted); font-size: 12px; margin-top: 6px; max-width: 70ch; }
  section { margin-bottom: 28px; }
  h2 { font-size: 15px; margin: 0 0 10px; color: var(--text-primary); }
  .tiles {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 12px;
  }
  @media (max-width: 640px) {
    .tiles { grid-template-columns: repeat(2, 1fr); }
  }
  .tile {
    background: var(--surface-1);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 14px 16px;
  }
  .tile .label { color: var(--text-secondary); font-size: 12px; }
  .tile .value { font-size: 24px; font-weight: 600; margin-top: 4px; }
  .card {
    background: var(--surface-1);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 16px;
  }
  svg { width: 100%; height: auto; display: block; }
  .bar { fill: var(--series-1); }
  .bar-empty { fill: var(--baseline); }
  .gridline { stroke: var(--gridline); stroke-width: 1; }
  .axis-label { fill: var(--text-muted); font-size: 10px; }
  .empty-note { color: var(--text-muted); }
  .table-scroll { overflow-x: auto; }
  table { border-collapse: collapse; width: 100%; min-width: 480px; font-variant-numeric: tabular-nums; }
  th, td { text-align: left; padding: 6px 10px; border-bottom: 1px solid var(--gridline); white-space: nowrap; }
  td.branches-cell { white-space: normal; word-break: break-word; max-width: 260px; }
  th { color: var(--text-secondary); font-weight: 600; font-size: 12px; cursor: pointer; user-select: none; }
  th.sortable::after { content: " \\2195"; color: var(--text-muted); font-size: 10px; }
  td.num, th.num { text-align: right; }
  .tag {
    display: inline-block;
    background: var(--tag-bg);
    color: var(--tag-fg);
    border-radius: 4px;
    font-size: 10px;
    padding: 1px 5px;
    margin-left: 4px;
  }
  .dot { color: var(--text-muted); font-size: 10px; margin-left: 4px; cursor: default; }
</style>
</head>
<body>
<header>
  <h1>${escapeHtml(projectName)} — session cost</h1>
  <div class="meta">generated ${escapeHtml(generated)}</div>
  ${note ? `<div class="note">${escapeHtml(note)}</div>` : ""}
</header>

<section class="tiles">
  <div class="tile"><div class="label">Total est. USD</div><div class="value">${fmtUsd(totalUsd)}</div></div>
  <div class="tile"><div class="label">Sessions</div><div class="value">${sessionCount}</div></div>
  <div class="tile"><div class="label">Active hours</div><div class="value">${fmtHours(totalHours)}</div></div>
  <div class="tile"><div class="label">USD / active hour</div><div class="value">${usdPerHour === null ? "—" : fmtUsd(usdPerHour)}</div></div>
</section>

<section>
  <h2>Cost by week</h2>
  <div class="card">${svg}</div>
</section>

<section>
  <h2>Cost by model</h2>
  <div class="card table-scroll">
    <table id="model-table">
      <thead><tr><th>Model</th><th class="num">Turns</th><th class="num">Est. USD</th><th class="num">Share</th></tr></thead>
      <tbody>
${modelRowsHtml || '<tr><td colspan="4">No model data.</td></tr>'}
      </tbody>
    </table>
  </div>
</section>

<section>
  <h2>Sessions</h2>
  <div class="card table-scroll">
    <table id="sessions-table">
      <thead>
        <tr>
          <th class="sortable" data-type="text">Date</th>
          <th class="sortable" data-type="text">Started</th>
          <th class="sortable num" data-type="num">Est. USD</th>
          <th class="sortable num" data-type="num">Active hours</th>
          <th class="sortable num" data-type="num">Turns</th>
          <th class="sortable num" data-type="num">Subagents</th>
          <th class="sortable" data-type="text">Branches</th>
        </tr>
      </thead>
      <tbody>
${sessionRowsHtml || '<tr><td colspan="7">No sessions.</td></tr>'}
      </tbody>
    </table>
  </div>
</section>

<script>
(function () {
  var table = document.getElementById("sessions-table");
  if (!table) return;
  var headers = table.querySelectorAll("th.sortable");
  var dir = {};
  headers.forEach(function (th, idx) {
    th.addEventListener("click", function () {
      var tbody = table.querySelector("tbody");
      var rows = Array.prototype.slice.call(tbody.querySelectorAll("tr"));
      var type = th.getAttribute("data-type");
      dir[idx] = !dir[idx];
      var mult = dir[idx] ? 1 : -1;
      rows.sort(function (a, b) {
        var av = a.children[idx].getAttribute("data-sort") || "";
        var bv = b.children[idx].getAttribute("data-sort") || "";
        if (type === "num") return (parseFloat(av) - parseFloat(bv)) * mult;
        return av.localeCompare(bv) * mult;
      });
      rows.forEach(function (r) { tbody.appendChild(r); });
    });
  });
})();
</script>
</body>
</html>
`;
}

function main() {
  try {
    const cwd = getCwd();
    const jsonPath = path.join(cwd, "project-accounting.json");
    let raw;
    try {
      raw = fs.readFileSync(jsonPath, "utf8");
    } catch {
      return; // missing JSON: do nothing silently
    }
    let data;
    try {
      data = JSON.parse(raw.replace(/^﻿/, ""));
    } catch {
      return; // unparsable: do nothing silently
    }
    if (!data || typeof data !== "object" || !Array.isArray(data.sessions)) return;

    const projectName = path.basename(cwd);
    const html = buildHtml(data, projectName);
    fs.writeFileSync(path.join(cwd, "project-accounting.html"), html);
  } catch {
    // fail open: this hook must never break a stop
  }
}

main();
