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
import { FINDINGS_CHECKS, byId } from "./registry.mjs";

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
  assert.match(hit.stdout, /fix: {4}Use the canonical visibility values/);

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
