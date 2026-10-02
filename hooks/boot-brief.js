#!/usr/bin/env node
// SessionStart: register the session (session-guard.js), then print a boot
// brief to stdout, which lands in Claude's context and replaces the bootstrap
// tool calls: git log, branch and working-tree state, unpushed commits, PLAN's
// "At a glance", HANDOFF.md if newer than the last commit, uncommitted
// [by Notetaker] lines, and other Claude sessions open in this checkout.
// Local facts only: no fetch, no network. Fails open (prints what it can).

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const guard = require("./session-guard.js");

let input = {};
try { input = JSON.parse(fs.readFileSync(0, "utf8").replace(/^﻿/, "") || "{}"); } catch {}
const cwd = input.cwd || process.cwd();

const git = (...args) => {
  try {
    return execFileSync("git", ["-c", "core.quotepath=off", ...args], {
      cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 4000,
    }).trimEnd();
  } catch {
    return null;
  }
};
const read = (p) => { try { return fs.readFileSync(p, "utf8"); } catch { return null; } };
const out = [];
const section = (title, body) => { if (body) out.push(`## ${title}\n${body}`); };

let rec = null;
if (input.session_id) {
  try {
    rec = guard.ensure(input);
    if (input.source !== "compact") rec.busy = false;
    guard.save(rec);
  } catch {}
}

const top = git("rev-parse", "--show-toplevel");
const root = top || cwd;

if (top) {
  section("git log", git("log", "--oneline", "-15"));
  const status = (git("status", "-sb") || "").split("\n");
  section("git status", status.slice(0, 20).join("\n") + (status.length > 20 ? `\n… ${status.length - 20} more` : ""));

  const main = git("rev-parse", "--verify", "-q", "refs/heads/main") ? "main" : "master";
  const unpushed = git("rev-list", "--count", `origin/${main}..${main}`);
  const branch = git("rev-parse", "--abbrev-ref", "HEAD");
  const lines = [];
  if (unpushed !== null) lines.push(`${main} ahead of origin/${main}: ${unpushed} (as of last fetch)`);
  if (branch && branch !== main) {
    const ahead = git("rev-list", "--count", "@{u}..HEAD");
    lines.push(ahead === null ? `${branch}: no upstream (never pushed)` : `${branch} unpushed commits: ${ahead}`);
  }
  section("push state", lines.join("\n"));

  const notes = (git("diff", "HEAD", "-U0", "--", "PLAN.md", "ROADMAP.md") || "")
    .split("\n").filter((l) => l.startsWith("+") && l.includes("[by Notetaker]"));
  section("uncommitted [by Notetaker] lines (triage these)", notes.join("\n"));
}

const plan = read(path.join(root, "PLAN.md"));
if (plan) {
  const m = plan.match(/^## At a glance\s*\n([\s\S]*?)(?=^## )/m);
  section("PLAN.md — At a glance", m ? m[1].trim() : null);
}

const handoffPath = path.join(root, "HANDOFF.md");
try {
  const lastCommit = Number(git("log", "-1", "--format=%ct") || 0) * 1000;
  if (fs.statSync(handoffPath).mtimeMs > lastCommit) {
    const h = read(handoffPath).split("\n");
    section("HANDOFF.md (newer than the last commit)", h.slice(0, 150).join("\n") + (h.length > 150 ? "\n… (truncated)" : ""));
  }
} catch {}

if (rec) {
  const others = guard.others(rec).map(
    (o) => `- ${o.id.slice(0, 8)}: ${o.busyNow ? "WORKING now" : "idle"}, last active ${o.ago} min ago`
  );
  section("other Claude sessions in this checkout", others.join("\n"));
}

if (out.length) {
  console.log(
    "Boot brief (SessionStart hook; local facts at session start — no need to re-run these reads):\n\n" +
      out.join("\n\n")
  );
}
