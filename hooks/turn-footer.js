#!/usr/bin/env node
// Stop hook: one footer line under each reply, for the user only (systemMessage,
// not added to Claude's context; no model call). Replaces the status line in the
// VS Code panel, where the status line does not run. Shows:
//   branch ●changed ↑unpushed · 🔒 read-only · ⚠ other session working ·
//   cache <size> warm till HH:MM (TTL read from the transcript's last usage block)
// Fails silent.

const fs = require("fs");
const { execFileSync } = require("child_process");
const guard = require("./session-guard.js");

function lastUsage(transcript) {
  try {
    const fd = fs.openSync(transcript, "r");
    const size = fs.fstatSync(fd).size;
    const len = Math.min(size, 400000);
    const buf = Buffer.alloc(len);
    fs.readSync(fd, buf, 0, len, size - len);
    fs.closeSync(fd);
    const lines = buf.toString("utf8").split("\n");
    for (let i = lines.length - 1; i >= 0; i--) {
      if (!lines[i].includes('"usage"')) continue;
      try {
        const d = JSON.parse(lines[i]);
        if (d.type === "assistant" && !d.isSidechain && d.message && d.message.usage)
          return { at: Date.parse(d.timestamp), usage: d.message.usage };
      } catch {}
    }
  } catch {}
  return null;
}

try {
  const input = JSON.parse(fs.readFileSync(0, "utf8").replace(/^﻿/, "") || "{}");
  const cwd = input.cwd || process.cwd();
  const git = (...a) => {
    try {
      return execFileSync("git", a, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 3000 }).trim();
    } catch {
      return null;
    }
  };
  const parts = [];

  const branch = git("rev-parse", "--abbrev-ref", "HEAD");
  if (branch) {
    const changed = (git("status", "--porcelain") || "").split("\n").filter(Boolean).length;
    const ahead = git("rev-list", "--count", "@{u}..HEAD");
    parts.push(`${branch} ●${changed} ${ahead === null ? "↑no upstream" : `↑${ahead}`}`);
  }

  const rec = input.session_id ? guard.load(input.session_id) : null;
  if (rec && rec.readOnly) parts.push("🔒 read-only");
  if (rec && guard.others(rec).some((o) => o.busyNow)) parts.push("⚠ other session working");

  const last = lastUsage(input.transcript_path);
  if (last && Number.isFinite(last.at)) {
    const u = last.usage;
    const cc = u.cache_creation || {};
    const ttlMin = cc.ephemeral_1h_input_tokens > 0 ? 60 : cc.ephemeral_5m_input_tokens > 0 ? 5 : null;
    const cached = (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0);
    if (ttlMin && cached) {
      const t = new Date(last.at + ttlMin * 60000);
      const hhmm = `${String(t.getHours()).padStart(2, "0")}:${String(t.getMinutes()).padStart(2, "0")}`;
      parts.push(`cache ${Math.round(cached / 1000)}k warm till ${hhmm}`);
    }
  }

  if (parts.length) console.log(JSON.stringify({ systemMessage: parts.join(" · ") }));
} catch {
  // fail silent
}
