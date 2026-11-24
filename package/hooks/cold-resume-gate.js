#!/usr/bin/env node
// Cold-resume gate (UserPromptSubmit hook).
// A turn sent after the prompt cache has expired re-writes the whole context
// at the cache-write price. Measured 2026-11-21 over 245 sessions: those turns
// cost $2.83 on average against $0.15 for a normal turn, about 13% of all spend.
// When the cache is cold and the re-write would cost MIN_USD or more, this hook
// blocks the prompt ONCE and shows the price with two numbered choices: recall
// the prompt (up arrow) and send it again to continue here, or /clear and start
// fresh from the boot brief. A hook cannot open a dialog at prompt time; the
// block is the only moment before the re-write is paid for.
//
// - Blocks once per idle gap: the gap is keyed by the timestamp of the last
//   turn, kept in ~/.claude/state/cold-gate-<session_id>.txt. The second send
//   passes. A new turn moves the timestamp, so the next long gap asks again.
// - Slash commands (/clear, /compact, ...) always pass.
// - Reads the cache size, TTL and model from the transcript's last main-thread
//   usage block (cost-lib.js). A turn that wrote nothing to the cache has no
//   TTL on record; one hour is assumed then, the TTL this harness uses.
// - Fails open: any error, unknown model or missing data means "allow".
//
// Threshold: env CLAUDE_COLD_RESUME_MIN_USD (default 5; was 2 until 2026-11-24,
// which fired on most resumes of a long session).
// TO DISABLE: env CLAUDE_COLD_RESUME_DISABLED=1, or remove the UserPromptSubmit
// entry for this file in ~/.claude/settings.json.

const fs = require("fs");
const path = require("path");
const os = require("os");
const { lastUsage, cacheState } = require("./cost-lib.js");

function main() {
  if (process.env.CLAUDE_COLD_RESUME_DISABLED === "1") return;
  const input = JSON.parse(fs.readFileSync(0, "utf8").replace(/^﻿/, "") || "{}");
  if (!input.session_id || !input.transcript_path) return;
  if (String(input.prompt || "").trimStart().startsWith("/")) return;

  const last = lastUsage(input.transcript_path);
  const c = cacheState(last);
  if (!c || c.resumeUsd === null) return;
  const expiresAt = c.expiresAt || last.at + 60 * 60000;
  if (Date.now() < expiresAt) return;
  const minUsd = Number(process.env.CLAUDE_COLD_RESUME_MIN_USD) || 5;
  if (c.resumeUsd < minUsd) return;

  const stateDir = path.join(os.homedir(), ".claude", "state");
  const marker = path.join(stateDir, `cold-gate-${input.session_id}.txt`);
  let seen = "";
  try {
    seen = fs.readFileSync(marker, "utf8").trim();
  } catch {}
  if (seen === String(last.at)) return; // already asked for this gap
  fs.mkdirSync(stateDir, { recursive: true });
  fs.writeFileSync(marker, String(last.at));

  const idleMin = Math.round((Date.now() - last.at) / 60000);
  const idle = idleMin >= 120 ? `${Math.round(idleMin / 60)} h` : `${idleMin} min`;
  const usd = c.resumeUsd.toFixed(2);
  const reason = [
    `Cache is cold (idle ${idle}). The next turn re-writes ${Math.round(c.cached / 1000)}k tokens, about $${usd} at list price.`,
    `  1. Continue here: press the up arrow to recall your prompt, then Enter (~$${usd}, once).`,
    "  2. Start fresh: /clear, then type the prompt again (the boot brief restores the state into a small context).",
  ].join("\n");
  console.log(
    JSON.stringify({
      decision: "block",
      reason,
      hookSpecificOutput: { hookEventName: "UserPromptSubmit", suppressOriginalPrompt: true },
    }),
  );
}

try {
  main();
} catch {
  // fail open: a cost gate must never stop a prompt by accident
}
