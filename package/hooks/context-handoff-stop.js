#!/usr/bin/env node
// Context-handoff Stop hook.
// When context usage crosses the threshold, block the stop and ask Claude to
// write HANDOFF.md (project root), report the exact percentage to the user,
// and recommend /clear. It then re-fires every 10 further points of growth
// (see BAND below), escalating to "stop now" at 70%. The next session reads
// HANDOFF.md via the session-bootstrap instructions in ~/.claude/CLAUDE.md;
// the file stays on disk (globally gitignored) and is overwritten each time
// this hook fires.
//
// Context usage is read from ~/.claude/state/context-pct-<session_id>.txt,
// written by the statusline relay (~/.claude/hooks/statusline.sh), which
// copies .context_window.used_percentage from its stdin JSON VERBATIM — no
// token math anywhere. (The previous transcript-derived measurement summed
// cumulative token totals against a hardcoded 200k window and false-fired
// "151%" on a 1M-window model that was actually at ~31%.)
// Sanity guard on both ends: null/missing/non-numeric/>100 -> treated as 0,
// and 0 never triggers. If the relay never ran (no statusline, e.g. some
// embedded panes), the state file is absent and this hook does nothing.
//
// TO DISABLE: set env var CLAUDE_CONTEXT_HANDOFF_DISABLED=1 (e.g. in the
// "env" block of ~/.claude/settings.json), or delete the "Stop" hook entry
// referencing this file in ~/.claude/settings.json.

const fs = require("fs");
const path = require("path");
const os = require("os");

function readStdin() {
  try {
    // Strip a UTF-8 BOM some shells prepend when piping.
    return fs.readFileSync(0, "utf8").replace(/^﻿/, "");
  } catch {
    return "";
  }
}

// Housekeeping: prune ~/.claude/state files older than 7 days (markers and
// stale context-pct relay files from finished sessions).
function pruneOldState() {
  try {
    const stateDir = path.join(os.homedir(), ".claude", "state");
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    for (const name of fs.readdirSync(stateDir)) {
      const p = path.join(stateDir, name);
      try {
        if (fs.statSync(p).mtimeMs < cutoff) fs.unlinkSync(p);
      } catch {}
    }
  } catch {}
}

// Context-window sizes by model-id substring. Only models listed here can
// trigger via the transcript fallback; unknown models return null (bail).
const MODEL_WINDOWS = [
  ["claude-fable-5", 1000000],
  ["claude-mythos-5", 1000000],
  // claude-opus-5 added 2026-08-21: it was MISSING, and that silently disabled
  // this hook for every Opus 5 session. "claude-opus-5".includes("claude-opus-4")
  // is false, so find() returned undefined, pctFromTranscript() returned null,
  // and main() bailed at the `pct === null` guard without a word. Because the
  // statusline relay does not run in the VSCode extension pane, the transcript
  // fallback is the ONLY measurement path there -- so an unlisted model means
  // no handoff at all. Symptom: HANDOFF.md had to be written by hand at ~57%
  // usage, twice, with no idea why. Keep this list current with the model list
  // in the system prompt; an unknown model fails SILENTLY by design.
  ["claude-opus-5", 1000000],
  ["claude-opus-4", 1000000],
  ["claude-sonnet-5", 1000000],
  ["claude-sonnet-4-6", 1000000],
  ["claude-haiku-4-5", 200000],
];

// Read the last assistant usage block from the transcript and compute the
// current prompt size as a percentage of the model's window. Returns null
// ("no data") on any doubt: unreadable file, no usage, unknown model, or a
// computed value outside (0, 100].
function pctFromTranscript(transcriptPath) {
  if (!transcriptPath) return null;
  let lines;
  try {
    lines = fs.readFileSync(transcriptPath, "utf8").split("\n");
  } catch {
    return null;
  }
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].replace(/^﻿/, "").trim();
    if (!line) continue;
    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }
    const msg = entry.message;
    const usage = msg && msg.usage;
    if (!usage || typeof usage.input_tokens !== "number") continue;
    const model = String(msg.model || "");
    const hit = MODEL_WINDOWS.find(([sub]) => model.includes(sub));
    if (!hit) return null; // unknown model: never guess a window
    const used =
      usage.input_tokens +
      (usage.cache_read_input_tokens || 0) +
      (usage.cache_creation_input_tokens || 0);
    const pct = (used / hit[1]) * 100;
    return Number.isFinite(pct) && pct > 0 && pct <= 100 ? pct : null;
  }
  return null;
}

function main() {
  if (process.env.CLAUDE_CONTEXT_HANDOFF_DISABLED === "1") return;
  pruneOldState();

  let input;
  try {
    input = JSON.parse(readStdin() || "{}");
  } catch {
    return; // malformed input, fail open
  }

  // Never block twice in a row for the same stop (avoids an infinite loop).
  if (input.stop_hook_active) return;

  const sessionId =
    input.session_id ||
    (input.transcript_path
      ? path.basename(input.transcript_path).replace(/\.jsonl$/, "")
      : "");
  if (!sessionId) return;

  const stateDir = path.join(os.homedir(), ".claude", "state");

  // Re-fires as context climbs. The marker stores the percentage at the last
  // firing; the hook then stays silent until usage grows another BAND points.
  // (It used to fire exactly ONCE per session. Under an unattended run --
  // "/goal ... I am leaving you to it" -- that single advisory landed at ~59%
  // and nothing then stopped the session reaching 74% / 724k tokens. Note a
  // LOW threshold made this worse, not better: the one nudge got spent early
  // and the expensive part of the session ran unwatched.)
  const BAND = 10;
  const URGENT = 70; // above this the message changes from "consider" to "stop"
  const marker = path.join(stateDir, `handoff-done-${sessionId}`);
  let lastPct = 0;
  try {
    if (fs.existsSync(marker))
      lastPct = parseFloat(fs.readFileSync(marker, "utf8").trim()) || 0;
  } catch {
    return;
  }

  // Current window usage, relayed by the statusline (percentage, 0-100).
  const statePath = path.join(stateDir, `context-pct-${sessionId}.txt`);
  let pct;
  try {
    pct = parseFloat(fs.readFileSync(statePath, "utf8").trim());
  } catch {
    // Relay never ran (no statusline in this pane, e.g. the VSCode extension).
    // Fallback: derive usage from the transcript's last usage block. The
    // window size comes from a per-model map - an UNKNOWN model bails rather
    // than guessing (the old hardcoded-200k approach false-fired on 1M models).
    pct = pctFromTranscript(input.transcript_path);
    if (pct === null) return; // no data by either path -> never trigger
  }
  // Sanity guard mirror: anything outside (0, 100] means "no data".
  if (!Number.isFinite(pct) || pct <= 0 || pct > 100) return;

  // Threshold is a fraction of the window (default 0.5 = fire at >=50%).
  const threshold = Number(process.env.CLAUDE_CONTEXT_HANDOFF_THRESHOLD || 0.5);
  if (pct < threshold * 100) return;
  // Already warned at this level: stay quiet until another BAND points of
  // growth -- except for the first crossing into URGENT, which must never be
  // swallowed by the band (e.g. warned at 69%, now at 74%).
  const enteringUrgent = pct >= URGENT && lastPct < URGENT;
  if (lastPct && pct < lastPct + BAND && !enteringUrgent) return;

  try {
    fs.mkdirSync(stateDir, { recursive: true });
    fs.writeFileSync(marker, String(pct));
  } catch {
    return; // can't record this firing -> stay silent, fail open
  }

  const pctStr = Math.round(pct);
  // Past ~70% the advice stops being advice: an unattended run must not open
  // new work it cannot finish, and every further turn re-reads the whole window.
  const urgent = pct >= URGENT;
  const climbed = lastPct
    ? `Up from ~${Math.round(lastPct)}% at the last handoff. `
    : "";
  const close = urgent
    ? `Then tell the user context is at ~${pctStr}% and STOP: do not start another task, ` +
      `another agent, or another edit in this session. If nobody is at the keyboard (an ` +
      `unattended "/goal"-style run), end the turn here rather than continuing -- the next ` +
      `session resumes from HANDOFF.md. Say plainly that you are stopping for context, not ` +
      `because the work is finished.`
    : `Then tell the user, in the chat, that context is at ~${pctStr}% and recommend starting ` +
      `a fresh session with /clear (the next session reads HANDOFF.md during bootstrap). Then finish normally.`;
  console.log(
    JSON.stringify({
      decision: "block",
      reason:
        `Context is ~${pctStr}% full. ${climbed}` +
        `Write (overwrite if present) HANDOFF.md in the project root (cwd) with these sections: ` +
        `Current task & status (what was being done, what's finished, what's mid-flight); ` +
        `Key decisions made this session (with reasons); Files created/modified; ` +
        `Next steps (concrete, ordered); Gotchas / open questions; ` +
        `Pointers (reference the relevant PLAN.md / ROADMAP.md items if they exist -- don't duplicate them). ` +
        `Start the file with a "Date: <today>" line so a stale handoff is detectable. ` +
        `Keep it under ~150 lines: it's a briefing for a fresh session, not a transcript. ` +
        close,
      systemMessage: urgent
        ? `🛑 Context at ~${pctStr}% — writing HANDOFF.md and stopping; start a fresh session with /clear.`
        : `⚠ Context at ~${pctStr}% — writing HANDOFF.md, consider /clear after this turn.`,
    })
  );
}

main();
