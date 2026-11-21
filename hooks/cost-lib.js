// Shared by session-cost-stop.js, turn-footer.js and cold-resume-gate.js:
// the one price table, the last main-thread usage block of a transcript, and
// the price of resuming a session whose prompt cache has expired.
//
// Prices are Anthropic API list rates, USD per 1M tokens:
//   [input, cache_write(5m), cache_read, output]
// A 1-hour cache write costs 1.6x the 5-minute rate (2x input).
// Matching is by prefix, first hit wins: keep the longer id above the shorter.
// Unknown models are counted in tokens but not priced. Keep this list current
// with the model list in the system prompt.
// Checked 2026-11-21. The haiku-5-5 cache rates are derived (1.25x and 0.1x
// input), not read from a price list.

const fs = require("fs");

const PRICES = [
  ["claude-fable-5-2", [8, 10, 0.2, 40]],
  ["claude-mythos-5-2", [8, 10, 0.2, 40]],
  ["claude-fable-5-1", [10, 12.5, 0.25, 50]],
  ["claude-mythos-5-1", [10, 12.5, 0.25, 50]],
  ["claude-fable-5", [10, 12.5, 1.0, 50]],
  ["claude-opus-5-5", [4, 5, 0.2, 20]],
  ["claude-opus-5", [5, 6.25, 0.5, 25]],
  ["claude-opus-4", [5, 6.25, 0.5, 25]],
  ["claude-sonnet-5-5", [2, 2.5, 0.1, 10]],
  ["claude-sonnet-5", [2, 2.5, 0.2, 10]],
  ["claude-sonnet-4-6", [3, 3.75, 0.3, 15]],
  ["claude-haiku-5-5", [0.1, 0.125, 0.01, 0.5]],
  ["claude-haiku-4-5", [1, 1.25, 0.1, 5]],
];

const HOUR_WRITE = 1.6; // 1-hour cache write, as a multiple of the 5-minute rate

function priceFor(model) {
  const hit = PRICES.find(([sub]) => String(model || "").startsWith(sub));
  return hit ? hit[1] : null;
}

// Last assistant usage block of the main thread, read from the transcript's tail.
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
          return { at: Date.parse(d.timestamp), usage: d.message.usage, model: d.message.model };
      } catch {}
    }
  } catch {}
  return null;
}

// What the cache looked like after that turn: how much is cached, how long it
// stays warm, and what re-writing it costs once it has expired.
// ttlMin is null when the turn wrote nothing to the cache (TTL unknown).
function cacheState(last) {
  if (!last || !Number.isFinite(last.at)) return null;
  const u = last.usage;
  const cc = u.cache_creation || {};
  const ttlMin = cc.ephemeral_1h_input_tokens > 0 ? 60 : cc.ephemeral_5m_input_tokens > 0 ? 5 : null;
  const cached = (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0);
  const p = priceFor(last.model);
  const rate = p ? p[1] * (ttlMin === 5 ? 1 : HOUR_WRITE) : null;
  return {
    cached,
    ttlMin,
    expiresAt: ttlMin ? last.at + ttlMin * 60000 : null,
    resumeUsd: rate === null ? null : (cached * rate) / 1e6,
  };
}

module.exports = { PRICES, HOUR_WRITE, priceFor, lastUsage, cacheState };
