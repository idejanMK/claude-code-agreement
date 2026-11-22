#!/usr/bin/env node
// Stop hook: one footer line under each reply, for the user only (systemMessage,
// not added to Claude's context; no model call). Replaces the status line in the
// VS Code panel, where the status line does not run. Shows:
//   branch ●changed ↑unpushed · 💬 talk / 🔒 read-only · ⚠ other session working ·
//   cache <size> warm till HH:MM, then ~$X to resume (cost-lib.js; the price shows from $1)
// Fails silent.

const fs = require("fs");
const { execFileSync } = require("child_process");
const guard = require("./session-guard.js");
const { lastUsage, cacheState } = require("./cost-lib.js");

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
  if (rec && rec.talk) parts.push("💬 talk (say accepted to end)");
  else if (rec && rec.readOnly) parts.push("🔒 read-only");
  if (rec && guard.others(rec).some((o) => o.busyNow)) parts.push("⚠ other session working");

  const c = cacheState(lastUsage(input.transcript_path));
  if (c && c.ttlMin && c.cached) {
    const t = new Date(c.expiresAt);
    const hhmm = `${String(t.getHours()).padStart(2, "0")}:${String(t.getMinutes()).padStart(2, "0")}`;
    const cold = c.resumeUsd >= 1 ? `, then ~$${c.resumeUsd.toFixed(2)} to resume` : "";
    parts.push(`cache ${Math.round(c.cached / 1000)}k warm till ${hhmm}${cold}`);
  }

  if (parts.length) console.log(JSON.stringify({ systemMessage: parts.join(" · ") }));
} catch {
  // fail silent
}
