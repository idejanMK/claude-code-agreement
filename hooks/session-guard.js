#!/usr/bin/env node
// Session guard: a registry of live Claude sessions per checkout, plus a write
// guard (PreToolUse) that blocks file edits inside any git checkout and git
// write commands (scratchpad and auto-memory stay open) when
//   (a) the user put this session in read-only mode by their own wording
//       (or in talk mode: "let's talk", a critique loop reminded every turn),
//   (b) another session is mid-turn and its last write went to the same
//       checkout (first writer wins; a session that only reads never blocks),
//   (c) this session parked its handoff this turn (only HANDOFF.md edits and
//       Bash stay open, so the handoff can still be committed).
// Limit: shell file writes (>, sed -i, python) are not parsed; only git writes are.
// Wiring (settings.json): node session-guard.js <start|prompt|pre|post|stop|end>
// State: ~/.claude/state/sessions/<session_id>.json, one file per session.
// Fails open: any error means "allow" and silence.
// Also required by boot-brief.js and turn-footer.js for the registry helpers.

const fs = require("fs");
const path = require("path");
const os = require("os");
const { execFileSync } = require("child_process");

const DIR = path.join(os.homedir(), ".claude", "state", "sessions");
const STATE = path.join(os.homedir(), ".claude", "state");
// Esc does not fire Stop, so a "busy" mark with no sign of life for this long is stale.
const BUSY_STALE_MS = 10 * 60 * 1000;
const PRUNE_MS = 24 * 60 * 60 * 1000;

// Read-only switches on only on clear phrasings ("just read.", "don't change
// anything", "no writing", "just a talk"); a go-ahead at the start always wins.
const RO_ON = new RegExp(
  [
    String.raw`\b(you can|only) (just )?read\b`,
    String.raw`\bjust read\s*([.,!]|$)`,
    String.raw`\bread[- ]only (mode|session)\b`,
    String.raw`\bno (writing|editing|edits?)\b`,
    String.raw`\b(do not|don'?t|dont|do nont)\s+(\w+\s+(or|and)\s+)?(edit|write|change|touch|update)\s+(anything(?!\s+else)|any code|(the )?code at all)\b`,
    String.raw`\bjust (check and report|a talk|talk)\b`,
    String.raw`\bno action (pls|please)\b`,
  ].join("|"),
  "im"
);
const RO_OFF_START =
  /^\s*((ok|yes|good|great|approved)[,.!]?\s+)*(go|build|approved|proceed|unlock|do it|implement)(\s*[,.!]|\s*$|\s+(ahead|build|buld|on|save|fix|start|do|with|merge|implement|for it|it)\b)/i;
const RO_OFF_ANY =
  /(?<!(not|n't|dont|no)\s+)\b(go build|go ahead|build it|you can (now )?(edit|write|build|change)|unlock)\b/i;
// Talk mode: "let's talk" starts a critique loop (read-only while it runs);
// "accepted"/"agreed" or a go-ahead ends it.
const TALK_ON = /\blet'?s\s+talk\b/i;
const TALK_OFF = /(?<!(not|n't|dont|no)\s+)\b(accepted|agreed|resolved)\b/i;
const TALK_RULES =
  "[session-guard] Talk mode is ON (the user said \"let's talk\"). This is a discussion, not a build. " +
  "Every reply: (1) criticize: say plainly what is weak, wrong or risky; (2) push back where you " +
  "disagree, with the reason; (3) suggest the better option; (4) end with the one point still open, " +
  "as a short question. Build on the user's last answer and drop points they settled. File edits and " +
  "git writes are blocked. The loop ends when the user says accepted, agreed, go or build; then " +
  "restate the agreed result in a few lines.";
// Messages from Claude's own agents and the harness arrive as prompts too.
const NOT_USER = /^\s*(<agent-message|<task-notification|\[SYSTEM NOTIFICATION|<system-reminder)/;
const PARK_WORDS =
  /\bhand[- ]?off\b|\/clear\b|\/clean\b|\bfresh session\b|\bstart (clean|fresh)\b|\bgo(ing)? to (bed|sleep)\b|\bstop here\b|\bwrap up\b/i;
// git at a command position, global options, then a verb that writes.
const GIT_WRITE =
  /(?:^\s*|[;&|({\n]\s*)(?:(?:then|do|else|time|exec|xargs)\s+)?git((?:\s+(?:-[cC]\s+(?:"[^"]*"|'[^']*'|\S+)|--[\w-]+(?:=\S+)?))*)\s+(commit|add|push|pull|checkout|switch|reset|rebase|merge|cherry-pick|revert|restore|rm|mv|am|apply|clean|stash(?!\s+(list|show))|worktree\s+(add|remove|move)|branch\s+-[dDmMf])(?![-\w])/;
const FILE_TOOLS = ["Edit", "Write", "MultiEdit", "NotebookEdit"];

const norm = (p) => String(p || "").replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
const unquote = (s) => s.replace(/^["']|["']$/g, "");
// Git Bash paths (/d/Code, ~) to Windows paths.
const winPath = (p) =>
  p.replace(/^~(?=\/|$)/, os.homedir().replace(/\\/g, "/")).replace(/^\/([a-zA-Z])(?=\/|$)/, "$1:");

// The git checkout holding `dir` (walks up to an existing folder), or null.
function repoOf(dir) {
  try {
    while (dir && !fs.existsSync(dir) && path.dirname(dir) !== dir) dir = path.dirname(dir);
    return norm(
      execFileSync("git", ["rev-parse", "--show-toplevel"], {
        cwd: dir, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 3000,
      }).trim()
    );
  } catch {
    return null;
  }
}
const rootOf = (cwd) => repoOf(cwd) || norm(cwd);

// The checkout a write lands in, or null when it is not guarded (outside any
// repo, e.g. the scratchpad; or the auto-memory folder inside ~/.claude).
function writeTarget(input) {
  const ti = input.tool_input || {};
  const cwd = input.cwd || process.cwd();
  if (FILE_TOOLS.includes(input.tool_name)) {
    const p = ti.file_path || ti.notebook_path;
    if (!p) return null;
    const abs = path.resolve(cwd, winPath(p));
    if (norm(abs).includes("/.claude/projects/")) return null;
    return repoOf(path.dirname(abs));
  }
  if (input.tool_name !== "Bash" && input.tool_name !== "PowerShell") return null;
  const cmd = ti.command || "";
  const g = cmd.match(GIT_WRITE);
  if (!g) return null;
  const dashC = (g[1] || "").match(/-C\s+("[^"]*"|'[^']*'|\S+)/);
  const cds = [...cmd.slice(0, g.index + 1).matchAll(/(?:^|[;&|]\s*)cd\s+("[^"]+"|'[^']+'|\S+)/g)];
  const dir = dashC ? dashC[1] : cds.length ? cds[cds.length - 1][1] : null;
  return (dir && repoOf(path.resolve(cwd, winPath(unquote(dir))))) || rootOf(cwd);
}

const file = (id) => path.join(DIR, `${id}.json`);
function load(id) {
  try { return JSON.parse(fs.readFileSync(file(id), "utf8")); } catch { return null; }
}
// Write to a temp file, then rename: a reader never sees half a file.
function save(rec) {
  fs.mkdirSync(DIR, { recursive: true });
  const tmp = `${file(rec.id)}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(rec, null, 1));
  fs.renameSync(tmp, file(rec.id));
}
function ensure(input) {
  const rec = load(input.session_id) || { id: input.session_id, started: Date.now() };
  if (!rec.root) rec.root = rootOf(input.cwd || process.cwd());
  if (input.transcript_path) rec.transcript = input.transcript_path;
  rec.lastSeen = Date.now();
  return rec;
}

// Last sign of life: the hook heartbeat or the transcript growing.
function lastAlive(rec) {
  let t = rec.lastSeen || 0;
  try { t = Math.max(t, fs.statSync(rec.transcript).mtimeMs); } catch {}
  return t;
}

// Other sessions registered for the same checkout (by start folder or last
// write), newest first. Prunes records dead for a day.
function others(rec) {
  let names = [];
  try { names = fs.readdirSync(DIR).filter((n) => n.endsWith(".json")); } catch { return []; }
  const out = [];
  for (const n of names) {
    const o = load(n.slice(0, -5));
    if (!o || o.id === rec.id) continue;
    const alive = lastAlive(o);
    if (Date.now() - alive > PRUNE_MS) { try { fs.unlinkSync(file(o.id)); } catch {} continue; }
    if (o.root !== rec.root && o.writeRoot !== rec.root) continue;
    o.busyNow = !!o.busy && Date.now() - alive < BUSY_STALE_MS;
    o.ago = Math.round((Date.now() - alive) / 60000);
    out.push(o);
  }
  return out.sort((a, b) => a.ago - b.ago);
}

// Another session mid-turn whose last write went to `target`.
function busyWriter(rec, target) {
  let names = [];
  try { names = fs.readdirSync(DIR).filter((n) => n.endsWith(".json")); } catch { return null; }
  for (const n of names) {
    const o = load(n.slice(0, -5));
    if (!o || o.id === rec.id || !o.busy || o.writeRoot !== target) continue;
    const alive = lastAlive(o);
    if (Date.now() - alive < BUSY_STALE_MS) return { ...o, ago: Math.round((Date.now() - alive) / 60000) };
  }
  return null;
}

// Records v2: a records/phases/<n>.<k>.md whose Status is "closed <date>" is frozen.
function closedPhaseFile(input) {
  try {
    const p = (input.tool_input || {}).file_path || "";
    if (!/[\\/]records[\\/]phases[\\/]\d+\.\d+\.md$/.test(p)) return false;
    const abs = path.resolve(input.cwd || process.cwd(), winPath(p));
    return /^- \*\*Status:\*\* closed \d{4}-\d{2}-\d{2}/m.test(fs.readFileSync(abs, "utf8"));
  } catch {
    return false;
  }
}

function deny(reason) {
  console.log(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: reason,
    },
  }));
}

const handlers = {
  start(input) {
    const rec = ensure(input);
    if (input.source !== "compact") rec.busy = false;
    rec.writeRoot = null;
    save(rec);
  },

  // Each turn starts with no claim on a checkout: first writer in a turn wins.
  prompt(input) {
    const rec = ensure(input);
    rec.busy = true;
    rec.writeRoot = null;
    const prompt = String(input.prompt || input.prompt_text || "");
    if (NOT_USER.test(prompt)) return save(rec);
    rec.parked = false;
    rec.promptAt = Date.now();
    rec.prompt = prompt.slice(0, 300);
    const on = prompt.match(RO_ON);
    if (TALK_ON.test(prompt)) {
      rec.talk = true;
      rec.readOnly = true;
      rec.readOnlyWhy = "let's talk";
      console.log(TALK_RULES);
    } else if (RO_OFF_START.test(prompt) || (!on && RO_OFF_ANY.test(prompt))) {
      if (rec.talk) console.log("[session-guard] Talk mode OFF. Restate the agreed result in a few lines.");
      else if (rec.readOnly) console.log("[session-guard] Read-only mode OFF.");
      rec.talk = false;
      rec.readOnly = false;
    } else if (rec.talk && TALK_OFF.test(prompt)) {
      console.log("[session-guard] Talk mode OFF (accepted). Restate the agreed result in a few lines; still read-only until the user says go or build.");
      rec.talk = false;
    } else if (rec.talk) {
      console.log(TALK_RULES);
    } else if (on) {
      if (!rec.readOnly)
        console.log(
          `[session-guard] Read-only mode ON (the user said "${on[0].trim()}"). File edits in any git ` +
            "checkout and git writes are blocked until the user says go, build or unlock. Do not " +
            "use shell commands to write files around it."
        );
      rec.readOnly = true;
      rec.readOnlyWhy = on[0].trim();
    }
    save(rec);
  },

  pre(input) {
    const rec = ensure(input);
    rec.busy = true;
    const target = writeTarget(input);
    const isAgent = input.tool_name === "Agent" || input.tool_name === "Task";
    const isFile = FILE_TOOLS.includes(input.tool_name);
    const handoff = path.basename((input.tool_input || {}).file_path || "") === "HANDOFF.md";
    let reason = null;

    if (rec.parked && ((target && isFile && !handoff) || isAgent)) {
      reason =
        "Session guard: the handoff is written, so this session is parked. Commit and push the " +
        "handoff if needed, then end the turn. Start no new edit or agent (user rule: the handoff " +
        "is the last act). It reopens on the user's next message.";
    } else if (isFile && closedPhaseFile(input)) {
      reason =
        "Session guard: this phase file is closed (its Status line says so) and closed phase files " +
        "are frozen (~/.claude/rules/records.md, rule 3). A correction goes to ROADMAP's Gotchas or " +
        "Decisions, or to the open phase; the closed record stays as it was.";
    } else if (target && rec.readOnly) {
      reason =
        `Session guard: read-only mode. The user said "${rec.readOnlyWhy}". Do not edit or run git ` +
        "writes, and do not write files through the shell instead; report. It lifts when the user " +
        "says go, build or unlock.";
    } else if (target) {
      const busy = busyWriter(rec, target);
      if (busy) {
        reason =
          `Session guard: another Claude session is mid-turn writing to ${target} (session ` +
          `${busy.id.slice(0, 8)}, active ${busy.ago} min ago). Writing now can collide with it. ` +
          "Stop and tell the user; this lifts by itself when that session finishes its turn.";
      } else {
        rec.writeRoot = target;
      }
    }
    if (reason) deny(reason); // before save: a failed save must not swallow a deny
    try { save(rec); } catch {}
  },

  post(input) {
    const ti = input.tool_input || {};
    if (path.basename(ti.file_path || "") !== "HANDOFF.md") return;
    const rec = ensure(input);
    let hookFired = false;
    try {
      hookFired = fs.statSync(path.join(STATE, `handoff-done-${rec.id}`)).mtimeMs > (rec.promptAt || 0);
    } catch {}
    if (hookFired || PARK_WORDS.test(rec.prompt || "")) rec.parked = true;
    save(rec);
  },

  stop(input) {
    const rec = ensure(input);
    rec.busy = false;
    save(rec);
  },

  end(input) {
    try { fs.unlinkSync(file(input.session_id)); } catch {}
  },
};

module.exports = { load, save, ensure, others, rootOf, patterns: { RO_ON, RO_OFF_START, RO_OFF_ANY, TALK_ON, TALK_OFF, PARK_WORDS, GIT_WRITE } };

if (require.main === module) {
  try {
    const input = JSON.parse(fs.readFileSync(0, "utf8").replace(/^﻿/, "") || "{}");
    const h = handlers[process.argv[2]];
    if (h && input.session_id) h(input);
  } catch {
    // fail open
  }
}
