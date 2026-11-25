#!/usr/bin/env node
// Session title (UserPromptSubmit hook).
// When a prompt starts work — `go <n>.<k>.<t>`, `/open-phase <n>.<k>`, `/close-phase [<n>.<k>]` —
// the session is named "<ID> <heading>" from the records (the task or phase heading in
// records/phases/<n>.<k>.md; close adds " · close"). No model call. Same effect as /rename.
//
// - The owner's own name wins: the hook remembers the last title it set in
//   ~/.claude/state/session-title-<session_id>.txt. If the session already has a custom
//   title that is not the one we set, the owner renamed it and the hook does nothing.
// - The latest work wins: a title we set is replaced when the next `go` names another task.
// - Any other prompt is left alone; a session that only asks questions keeps its generated title.
// - Fails open: any error means "no output", and the prompt always goes through.
//
// Pure parts are exported for tests (tests/session-title.test.js).

const fs = require("fs");
const path = require("path");
const os = require("os");

const ID = String.raw`(\d+\.\d+\.\d+(?:\.\d+)?)`; // task, or subtask
const PHASE_ID = String.raw`(\d+\.\d+)`;
const DASH = "[—–-]"; // — – -
// Editors put tag blocks (<ide_selection>…</ide_selection> and the like) before the typed text.
const LEADING_BLOCKS = /^(?:\s*<([A-Za-z][\w-]*)(?:\s[^>]*)?>[\s\S]*?<\/\1>)+/;

function parseWorkPrompt(prompt) {
  const p = String(prompt || "").replace(LEADING_BLOCKS, "").trim();
  let m;
  if ((m = p.match(new RegExp(String.raw`^go\s+${ID}(?!\.?\d)`, "i")))) return { kind: "go", id: m[1] };
  if ((m = p.match(new RegExp(String.raw`^/open-phase\s+${PHASE_ID}(?!\.?\d)`, "i")))) return { kind: "open", id: m[1] };
  if ((m = p.match(new RegExp(String.raw`^/close-phase(?:\s+${PHASE_ID}(?!\.?\d))?(?:\s|$)`, "i")))) {
    return { kind: "close", id: m[1] || null };
  }
  return null;
}

function escapeId(id) {
  return id.replace(/\./g, "\\.");
}

// `text` is the phase file; returns "<id> <heading>" or null.
function titleFor(work, text) {
  if (!work || !work.id || !text) return null;
  const id = escapeId(work.id);
  let re;
  if (work.kind === "go") re = new RegExp(String.raw`^#{3,4}\s+${id}\s+${DASH}\s+(.+?)\s*$`, "m");
  else re = new RegExp(String.raw`^#\s+${id}\s+${DASH}\s+(.+?)\s*$`, "m");
  const m = text.match(re);
  if (!m) return null;
  const title = `${work.id} ${m[1]}`;
  return work.kind === "close" ? `${title} · close` : title;
}

// The open phase's id from PLAN.md's "Phase file" line, or null.
function openPhaseId(planText) {
  if (!planText) return null;
  const m = planText.match(/\*\*Phase file:\*\*\s*\[(\d+\.\d+)\s/);
  return m ? m[1] : null;
}

function shouldSet({ sessionTitle, lastSet, next }) {
  if (!next || sessionTitle === next) return false;
  if (sessionTitle && sessionTitle !== lastSet) return false; // the owner's own name
  return true;
}

function read(file) {
  try {
    return fs.readFileSync(file, "utf8");
  } catch {
    return null;
  }
}

function main() {
  const input = JSON.parse(fs.readFileSync(0, "utf8").replace(/^﻿/, "") || "{}");
  const work = parseWorkPrompt(input.prompt);
  if (!work || !input.session_id) return;
  const root = input.cwd || process.cwd();
  if (!work.id) work.id = openPhaseId(read(path.join(root, "PLAN.md")));
  if (!work.id) return;
  const phaseId = work.kind === "go" ? work.id.split(".").slice(0, 2).join(".") : work.id;
  const next = titleFor(work, read(path.join(root, "records", "phases", `${phaseId}.md`)));
  if (!next) return;

  const stateDir = path.join(os.homedir(), ".claude", "state");
  const marker = path.join(stateDir, `session-title-${input.session_id}.txt`);
  const lastSet = (read(marker) || "").trim() || null;
  if (!shouldSet({ sessionTitle: input.session_title, lastSet, next })) return;

  fs.mkdirSync(stateDir, { recursive: true });
  fs.writeFileSync(marker, next);
  console.log(JSON.stringify({ hookSpecificOutput: { hookEventName: "UserPromptSubmit", sessionTitle: next } }));
}

module.exports = { parseWorkPrompt, titleFor, openPhaseId, shouldSet };

if (require.main === module) {
  try {
    main();
  } catch {
    // fail open: a naming hook must never stop a prompt
  }
}
