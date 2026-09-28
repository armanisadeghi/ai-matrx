// findings.test.mjs — `pnpm findings` keeps its promise (PLAN.md decision 8, C1).
//
//   - every converted check has a registry entry (a conversion with no entry is invisible here);
//   - each accept adapter writes the key in the format its check reads — proven by running the
//     REAL check: the item flips new → known and every other item keeps its status;
//   - refusals: empty reason, no adapter, a key the check does not emit, a key already known,
//     an allowlist with somebody else's uncommitted edits;
//   - `findings <paths>` exits 1 on a new item in the paths, 0 otherwise;
//   - the commit takes exactly the allowlist file, never another staged file.
// Run: `pnpm test:findings`. Real-repo accepts use --no-commit and restore the file's bytes.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { manifestRows, runRows } from "../checks/run.mjs";
import { REPO_ROOT, accept, collect, commitOnly, parseArgs, shellQuote } from "./findings.mjs";
import { appendToJsonArray } from "./json-edit.mjs";
import { CORPUS_PATH, RuleError, applyAcceptRule, commitLine, loadAcceptRules, readUtf8Strict } from "./accept-rules.mjs";
import { FINDINGS_CHECKS, byId } from "./registry.mjs";
import { remedyForKey } from "../visibility-vocab/remedies.mjs";

const ROWS = manifestRows();

async function states(id) {
  const findings = await runRows(ROWS.filter((r) => r.id === id), { workers: 1 });
  return new Map(findings.filter((f) => f.item_key).map((f) => [f.item_key, f.ratchet]));
}

/** Run fn, then put every named file back byte-for-byte, whatever happened. */
async function withRestored(files, fn) {
  const saved = files.map((f) => [f, (() => { try { return readFileSync(join(REPO_ROOT, f)); } catch { return null; } })()]);
  try {
    return await fn();
  } finally {
    for (const [f, bytes] of saved) {
      if (bytes) writeFileSync(join(REPO_ROOT, f), bytes);
      else spawnSync("rm", ["-f", join(REPO_ROOT, f)]);
    }
  }
}

test("every converted check (scripts/checks/converted-checks.test.mjs) has a findings registry entry and a runner row", () => {
  const converted = [...readFileSync(join(REPO_ROOT, "scripts/checks/converted-checks.test.mjs"), "utf8").matchAll(/^\s+id: "([^"]+)",$/gm)].map((m) => m[1]);
  assert.ok(converted.length >= 8, `found only ${converted.length} converted ids`);
  assert.deepEqual(converted.filter((id) => !byId(id)), [], "converted checks missing from scripts/findings/registry.mjs");
  assert.deepEqual(FINDINGS_CHECKS.filter((c) => !ROWS.some((r) => r.id === c.id)).map((c) => c.id), [], "registry ids with no runner row");
  for (const c of FINDINGS_CHECKS) assert.ok(c.accept || c.noAccept, `${c.id}: neither an adapter nor a noAccept explanation`);
});

test("accept-rules.json declares exactly the registry's checks, each with a rule or a reason", () => {
  const { checks } = loadAcceptRules();
  assert.deepEqual(Object.keys(checks).sort(), FINDINGS_CHECKS.map((c) => c.id).sort());
  for (const [id, entry] of Object.entries(checks)) {
    assert.ok(Boolean(entry.accept) !== Boolean(entry.no_accept), `${id}: exactly one of accept / no_accept`);
  }
});

test("the JS engine reproduces every golden case in accept-corpus.json byte for byte (the server's Python twin is held to the same file)", () => {
  const { cases } = JSON.parse(readFileSync(join(REPO_ROOT, CORPUS_PATH), "utf8"));
  assert.ok(cases.length >= 8, `corpus has only ${cases.length} case(s)`);
  const { checks } = loadAcceptRules();
  for (const [id, entry] of Object.entries(checks)) {
    if (entry.accept) {
      assert.ok(cases.some((c) => JSON.stringify(c.rule) === JSON.stringify(entry.accept)), `${id}: its live rule has no corpus case — run node scripts/findings/accept-rules.mjs --write-corpus`);
    }
  }
  for (const c of cases) {
    if (c.refused) {
      assert.throws(() => applyAcceptRule(c.rule, c.files, c.params), RuleError, `corpus case "${c.name}" is a refusal the engine no longer makes`);
    } else {
      assert.deepEqual(applyAcceptRule(c.rule, c.files, c.params), c.expected, `corpus case "${c.name}" no longer matches the engine`);
    }
  }
});

// ── MARK-OK-VERIFY (common-docs/projects/checks-run-in-the-app/MARK-OK-VERIFY.md) ────────────────

const DETECTOR = { kind: "detector-allowlist", file: "a.json", detectors: ["d1"] };
const P = (key, reason = "why") => ({ key, reason, by: "Ada", date: "2026-09-26" });

test("D2: an accept the file already carries changes nothing — a retry never writes a second entry", () => {
  const once = applyAcceptRule(DETECTOR, { "a.json": '{\n  "d1": []\n}\n' }, P("d1|x.ts|7"));
  assert.deepEqual(applyAcceptRule(DETECTOR, once, P("d1|x.ts|7", "retried with another reason")), {});
  assert.deepEqual(applyAcceptRule(DETECTOR, once, P("d1|x.ts|*")).hasOwnProperty("a.json"), true, "a whole-file entry is a different entry");
  const ids = { kind: "ids-count-reasons", file: "c.json" };
  const first = applyAcceptRule(ids, { "c.json": '{\n  "count": 0,\n  "ids": []\n}\n' }, P("k"));
  assert.deepEqual(applyAcceptRule(ids, first, P("k", "again")), {});
  const sorted = { kind: "sorted-array-with-sibling-reasons", file: "b.json", reasons_file: "r.json", reasons_readme: "r" };
  const got = applyAcceptRule(sorted, { "b.json": "[]\n", "r.json": null }, P("k"));
  assert.deepEqual(applyAcceptRule(sorted, got, P("k", "again")), {});
});

test("D4: a line or key the two engines would read differently is refused, never guessed", () => {
  const files = { "a.json": '{\n  "d1": []\n}\n' };
  for (const line of ["0", "-0", "0x10", "0b11", "1e3", "1_0", "\u0663", "Infinity", "NaN", "9007199254740993", "012", " 12"]) {
    assert.throws(() => applyAcceptRule(DETECTOR, files, P(`d1|x.ts|${line}`)), RuleError, `line ${JSON.stringify(line)} was not refused`);
  }
  assert.throws(() => applyAcceptRule(DETECTOR, files, P("d1|lone \ud800.ts|*")), RuleError);
  assert.throws(() => applyAcceptRule(DETECTOR, files, P("d1|x.ts|*", "lone \udc00")), RuleError);
  const sorted = { kind: "sorted-array-with-sibling-reasons", file: "b.json", reasons_file: "r.json", reasons_readme: "r" };
  for (const key of ["42", "1", "__proto__"]) {
    assert.throws(() => applyAcceptRule(sorted, { "b.json": "[]\n", "r.json": null }, P(key)), RuleError, `key ${key} was not refused`);
  }
  assert.throws(() => applyAcceptRule({ kind: "ids-count-reasons", file: "c.json" }, { "c.json": '{"ratio": 0.5, "ids": []}' }, P("k")), RuleError);
});

test("D4: a file that is not valid UTF-8 is refused, never rewritten with U+FFFD", () => {
  const dir = mkdtempSync(join(tmpdir(), "findings-utf8-"));
  writeFileSync(join(dir, "bad.json"), Buffer.from([0x7b, 0x22, 0xff, 0x22, 0x3a, 0x31, 0x7d]));
  assert.throws(() => readUtf8Strict(join(dir, "bad.json")), RuleError);
});

test("D5: the commit line collapses newlines and neutralizes CI skip directives", () => {
  const line = commitLine("fine [skip ci]\n\nCo-Authored-By: Mallory <m@x>\r\u001b[31m ***NO_CI*** [ CI  Skip ]\u2028x");
  assert.ok(!/[\n\r\u001b\u2028]/.test(line), line);
  assert.ok(!/\[\s*(skip ci|ci\s+skip)\s*\]|\*\*\*NO_CI\*\*\*/i.test(line), line);
  assert.match(line, /^fine \(skip ci\) Co-Authored-By: Mallory <m@x> \[31m \(NO_CI\) \(CI Skip\) x$/);
});

test("appendToJsonArray appends one entry in place and leaves every other byte alone", () => {
  const text = '{\n  "_c": "a \\u2014 b",\n\n  "a": [\n    1\n  ],\n  "b": []\n}\n';
  const out = appendToJsonArray(text, "a", { x: 1 });
  assert.equal(out, '{\n  "_c": "a \\u2014 b",\n\n  "a": [\n    1,\n    {\n      "x": 1\n    }\n  ],\n  "b": []\n}\n');
  assert.deepEqual(JSON.parse(appendToJsonArray(text, "b", "z")).b, ["z"]);
  assert.deepEqual(JSON.parse(appendToJsonArray('[\n  "a"\n]\n', null, "b")), ["a", "b"]);
  assert.throws(() => appendToJsonArray(text, "_c", 1), /not an array/);
});

test("shell quoting survives the keys checks really emit", () => {
  for (const key of ["a|b.tsx|*", "x.tsx::`Deleted \"${t.name}\"`", "it's"]) {
    const r = spawnSync("bash", ["-c", `printf %s ${shellQuote(key)}`], { encoding: "utf8" });
    assert.equal(r.stdout, key);
  }
  assert.deepEqual(parseArgs(["accept", "c", "k", "--reason", "why", "--no-commit"]).positional, ["c", "k"]);
});

test("findings <paths>: exit 1 on a new item in the paths, 0 on a clean or unwatched path", async () => {
  const all = await collect({ checkIds: ["visibility-vocabulary"], rows: ROWS });
  const fresh = all.items.find((i) => i.ratchet === "new");
  assert.ok(fresh?.file, "visibility-vocabulary has no new item to test with (accept or fix changed the fixture?)");
  const run = (args) => spawnSync("node", ["scripts/findings/findings.mjs", ...args], { cwd: REPO_ROOT, encoding: "utf8", timeout: 600_000 });

  const hit = run([fresh.file, "--check", "visibility-vocabulary"]);
  assert.equal(hit.status, 1, hit.stdout + hit.stderr);
  assert.match(hit.stdout, new RegExp(`pnpm findings accept visibility-vocabulary ${shellQuote(fresh.item_key).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} --reason`));
  // The item's OWN class remedy, not the all-classes summary (visibility-vocab/remedies.mjs).
  assert.ok(hit.stdout.includes(`fix:    ${remedyForKey(fresh.item_key)}`), hit.stdout);

  const clean = run(["README.md"]);
  assert.equal(clean.status, 0, clean.stdout);
  assert.match(clean.stdout, /0 checks run/);

  const cleanFile = run(["lib/toast.ts", "--check", "visibility-vocabulary"]);
  assert.equal(cleanFile.status, 0, cleanFile.stdout);
  assert.match(cleanFile.stdout, /findings: 0 new in 1 path/);
});

test("refusals: empty reason, no adapter, a key not emitted, a key already known", async () => {
  await assert.rejects(accept({ checkId: "visibility-vocabulary", key: "k", reason: " ", commit: false, rows: ROWS }), /reason .* required/);
  await assert.rejects(accept({ checkId: "url-state-written-outside-the-canonical-primitive", key: "k", reason: "r", commit: false, rows: ROWS }), /no accept adapter.*scripts\/findings\/registry\.mjs/s);
  await assert.rejects(accept({ checkId: "no-such-check", key: "k", reason: "r", commit: false, rows: ROWS }), /not a converted check/);
  await withRestored(["scripts/visibility-vocab/allowlist.json"], async () => {
    await assert.rejects(accept({ checkId: "visibility-vocabulary", key: "onlyYouClaim|does/not/exist.tsx|*", reason: "r", commit: false, rows: ROWS }), /does not emit/);
    const known = [...(await states("visibility-vocabulary"))].find(([, s]) => s === "known")[0];
    await assert.rejects(accept({ checkId: "visibility-vocabulary", key: known, reason: "r", commit: false, rows: ROWS }), /already known/);
  });
  assert.equal(spawnSync("git", ["status", "--porcelain", "--", "scripts/visibility-vocab/allowlist.json"], { cwd: REPO_ROOT, encoding: "utf8" }).stdout, "", "a refusal must leave the allowlist untouched");
});

/** The real accept, on the real check: the key flips to known and NOTHING else moves. */
async function provesAccept(checkId) {
  const check = byId(checkId);
  await withRestored(check.accept.files, async () => {
    const before = await states(checkId);
    const key = [...before].find(([, s]) => s === "new")?.[0];
    assert.ok(key, `${checkId} has no new item to accept`);
    const r = await accept({ checkId, key, reason: "findings.test.mjs proof — restored after", commit: false, rows: ROWS, by: "findings-test" });
    assert.equal(r.committed, null);
    const after = await states(checkId);
    assert.equal(after.get(key), "known", `${key} is not known after accept`);
    const moved = [...new Set([...before.keys(), ...after.keys()])].filter((k) => k !== key && before.get(k) !== after.get(k));
    assert.deepEqual(moved, [], "accept changed other items");
    const written = check.accept.files.map((f) => readFileSync(join(REPO_ROOT, f), "utf8")).join("\n");
    assert.match(written, /findings\.test\.mjs proof/, "the reason is not recorded next to the entry");
    assert.match(written, /findings-test/, "accepted-by is not recorded");
  });
}

test("accept (visibility-vocabulary, detector allowlist): the item becomes known, every other item unchanged", () => provesAccept("visibility-vocabulary"));
test("accept (record-toasts, ids baseline + reasons map): the item becomes known, every other item unchanged", () => provesAccept("record-naming-toasts-carry-their-record"));
test("accept (api-contract-ratchet, array baseline + sibling reasons): the item becomes known, every other item unchanged", () => provesAccept("api-contract-ratchet"));

test("accept refuses an allowlist somebody else has uncommitted edits in", async () => {
  const rel = "scripts/visibility-vocab/allowlist.json";
  await withRestored([rel], async () => {
    writeFileSync(join(REPO_ROOT, rel), `${readFileSync(join(REPO_ROOT, rel), "utf8")}\n`);
    await assert.rejects(accept({ checkId: "visibility-vocabulary", key: "x", reason: "r", commit: true, rows: ROWS }), /uncommitted changes/);
  });
});

test("commitOnly commits exactly the allowlist file, never another staged file", () => {
  const dir = mkdtempSync(join(tmpdir(), "findings-commit-"));
  const g = (...a) => spawnSync("git", a, { cwd: dir, encoding: "utf8" });
  g("init", "-q");
  g("config", "user.email", "t@t");
  g("config", "user.name", "t");
  mkdirSync(join(dir, "scripts"));
  writeFileSync(join(dir, "scripts/allow.json"), "[]\n");
  writeFileSync(join(dir, "other.txt"), "a\n");
  g("add", ".");
  g("commit", "-qm", "init");
  writeFileSync(join(dir, "scripts/allow.json"), '["k"]\n');
  writeFileSync(join(dir, "other.txt"), "someone else's staged work\n");
  g("add", "other.txt");
  const r = commitOnly(dir, ["scripts/allow.json", "scripts/allow.reasons.json"], "accept k");
  assert.deepEqual(r.files, ["scripts/allow.json"]);
  assert.equal(g("show", "--name-only", "--format=", "HEAD").stdout.trim(), "scripts/allow.json");
  assert.match(g("status", "--porcelain").stdout, /^M  other\.txt$/m, "the other session's staged file must stay staged, uncommitted");
});
