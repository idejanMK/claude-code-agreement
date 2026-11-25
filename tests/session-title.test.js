// Tests for the session-title hook's pure parts, written from the 2.1.2 spec
// (records/phases/2.1.md) before the implementation.
const test = require("node:test");
const assert = require("node:assert/strict");
const { parseWorkPrompt, titleFor, openPhaseId, shouldSet } = require("../package/hooks/session-title.js");

const PHASE = `# 2.1 — Session naming

- **Milestone:** M2

## Task details

### 2.1.3 — Wire, document, reinstall
- **Status:** todo

### 2.1.2 — The hook: title from the records, owner's rename wins
- **Status:** todo

#### 2.1.2.1 — Parser
- **Status:** todo

### 2.1.1 — Spike: a hook-set title shows in the VS Code session list
- **Status:** todo
`;

const PLAN = `# PLAN — demo

## Open phase

- **Phase file:** [2.1 — Session naming](records/phases/2.1.md)
- **Next proposed:** —
`;

test("parseWorkPrompt: go <task id>, any case, surrounding whitespace, trailing words", () => {
  assert.deepEqual(parseWorkPrompt("go 2.1.2"), { kind: "go", id: "2.1.2" });
  assert.deepEqual(parseWorkPrompt("  Go 2.1.2  "), { kind: "go", id: "2.1.2" });
  assert.deepEqual(parseWorkPrompt("GO 2.1.2 and keep it small"), { kind: "go", id: "2.1.2" });
  assert.deepEqual(parseWorkPrompt("go 2.1.2.1"), { kind: "go", id: "2.1.2.1" });
  assert.deepEqual(parseWorkPrompt("go 2.1.2. Keep it small"), { kind: "go", id: "2.1.2" }); // a sentence-ending stop
  assert.equal(parseWorkPrompt("go 2.1.2.1.5"), null); // five segments is not an id
});

test("parseWorkPrompt: /open-phase and /close-phase, with and without an id", () => {
  assert.deepEqual(parseWorkPrompt("/open-phase 2.3"), { kind: "open", id: "2.3" });
  assert.deepEqual(parseWorkPrompt("/close-phase 2.1"), { kind: "close", id: "2.1" });
  assert.deepEqual(parseWorkPrompt("/close-phase"), { kind: "close", id: null });
});

test("parseWorkPrompt: anything else is not a work-starting prompt", () => {
  assert.equal(parseWorkPrompt("2.1.1 spike title worked"), null);
  assert.equal(parseWorkPrompt("let's go through 2.1.2 together"), null);
  assert.equal(parseWorkPrompt("go 2.1"), null); // a phase id is not a task
  assert.equal(parseWorkPrompt("go"), null);
  assert.equal(parseWorkPrompt("gopher 2.1.2"), null);
  assert.equal(parseWorkPrompt("/open-phase"), null);
  assert.equal(parseWorkPrompt("what does go 2.1.2 do?"), null);
  assert.equal(parseWorkPrompt(""), null);
  assert.equal(parseWorkPrompt(undefined), null);
});

test("titleFor go: the task heading from the phase file, id first, no 'go'", () => {
  assert.equal(titleFor({ kind: "go", id: "2.1.2" }, PHASE), "2.1.2 The hook: title from the records, owner's rename wins");
  assert.equal(titleFor({ kind: "go", id: "2.1.3" }, PHASE), "2.1.3 Wire, document, reinstall");
});

test("titleFor go: a subtask heading (####) is found too", () => {
  assert.equal(titleFor({ kind: "go", id: "2.1.2.1" }, PHASE), "2.1.2.1 Parser");
});

test("titleFor go: 2.1.2 does not match 2.1.21 or 2.1.2.1", () => {
  const text = "### 2.1.21 — Other\n#### 2.1.2.1 — Sub\n";
  assert.equal(titleFor({ kind: "go", id: "2.1.2" }, text), null);
});

test("titleFor: a phase file with CRLF line endings (a Windows clone) gives a clean title", () => {
  const crlf = PHASE.replace(/\n/g, "\r\n");
  assert.equal(titleFor({ kind: "go", id: "2.1.2" }, crlf), "2.1.2 The hook: title from the records, owner's rename wins");
  assert.equal(titleFor({ kind: "open", id: "2.1" }, crlf), "2.1 Session naming");
});

test("titleFor open/close: the phase title; close is marked", () => {
  assert.equal(titleFor({ kind: "open", id: "2.1" }, PHASE), "2.1 Session naming");
  assert.equal(titleFor({ kind: "close", id: "2.1" }, PHASE), "2.1 Session naming · close");
});

test("titleFor: no heading, no file → null (the hook then does nothing)", () => {
  assert.equal(titleFor({ kind: "go", id: "9.9.9" }, PHASE), null);
  assert.equal(titleFor({ kind: "go", id: "2.1.2" }, null), null);
  assert.equal(titleFor({ kind: "open", id: "2.1" }, ""), null);
});

test("openPhaseId: read from PLAN's Phase file line; none → null", () => {
  assert.equal(openPhaseId(PLAN), "2.1");
  assert.equal(openPhaseId("## Open phase\n\n- **Phase file:** none\n"), null);
  assert.equal(openPhaseId(null), null);
});

test("shouldSet: a generated title is replaced; our own earlier name is replaced; the owner's name stays", () => {
  // no custom title yet (session_title absent) → set
  assert.equal(shouldSet({ sessionTitle: undefined, lastSet: null, next: "2.1.2 X" }), true);
  // the current title is what we set last time → latest work wins
  assert.equal(shouldSet({ sessionTitle: "2.1.2 X", lastSet: "2.1.2 X", next: "2.1.3 Y" }), true);
  // the current title is not ours → the owner renamed; leave it
  assert.equal(shouldSet({ sessionTitle: "my own name", lastSet: "2.1.2 X", next: "2.1.3 Y" }), false);
  assert.equal(shouldSet({ sessionTitle: "my own name", lastSet: null, next: "2.1.3 Y" }), false);
  // same title again → nothing to do
  assert.equal(shouldSet({ sessionTitle: "2.1.2 X", lastSet: "2.1.2 X", next: "2.1.2 X" }), false);
});
