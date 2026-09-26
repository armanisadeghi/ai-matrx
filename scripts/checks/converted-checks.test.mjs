// converted-checks.test.mjs — every check converted to the item line (C5) keeps its promise.
//
// For each converted check, run it TWICE over the real repository — once as a person runs it, once
// as the runner does (MATRX_ITEMS=1) — and prove:
//   1. the verdict is unchanged: same exit code either way;
//   2. it names its items: at least one item line when it has anything to say;
//   3. KEYS EQUAL THE ALLOWLIST: every `known` key is a key of the check's own allowlist/baseline,
//      and every allowlist/baseline key is emitted as `known` unless the check itself reports that
//      entry as stale (it suppressed nothing this run);
//   4. a `new` key is never an allowlist key (then it would be known).
// Protocol: common-docs/projects/checks-run-in-the-app/ITEM-PROTOCOL.md. Run: `node --test scripts/checks/converted-checks.test.mjs`.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { parseItems } from "./items.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const json = (rel) => JSON.parse(readFileSync(join(ROOT, rel), "utf8"));
const ANSI = /\u001b\[[0-9;]*[A-Za-z]/g;

function run(cmd, items) {
  const env = { ...process.env, FORCE_COLOR: "0", NO_COLOR: "1" };
  if (items) env.MATRX_ITEMS = "1";
  else delete env.MATRX_ITEMS;
  const r = spawnSync("bash", ["-c", cmd], { cwd: ROOT, env, encoding: "utf8", maxBuffer: 256 * 1024 * 1024, timeout: 600_000 });
  return { code: r.status, out: `${r.stdout ?? ""}\n${r.stderr ?? ""}`.replace(ANSI, "") };
}

/**
 * One row per converted check:
 *   cmd        — the runner's command for it (scripts/run-release-gates.sh --list)
 *   allowKeys  — the check's allowlist/baseline, as the keys the check itself matches on
 *   keyShape   — every allowlist key and every emitted key has this shape (same key space)
 *   staleKeys  — (output) → keys the check reports as stale this run (they cannot be emitted).
 *                A check that reports no staleness omits it: then an allowlist key the run did not
 *                match is listed as a diagnostic (a stale entry to prune), not a failure.
 */
export const CONVERTED = [
  {
    id: "visibility-vocabulary",
    cmd: "pnpm exec tsx scripts/check-visibility-vocab.ts --strict",
    allowKeys() {
      const a = json("scripts/visibility-vocab/allowlist.json");
      return ["retiredSpelling", "collapsedUnion", "onlyYouClaim"].flatMap((d) =>
        (a[d] ?? []).map((e) => `${d}|${e.file}|${e.line ?? "*"}`),
      );
    },
    keyShape: /^(retiredSpelling|collapsedUnion|onlyYouClaim)\|[^|]+\|(\*|\d+)$/,
    staleKeys(out) {
      return [...out.matchAll(/\[STALE\] (\S+?)(?::(\d+))? \((\w+)\)/g)].map((m) => `${m[3]}|${m[1]}|${m[2] ?? "*"}`);
    },
  },
  {
    id: "access-guard-check",
    cmd: "pnpm exec tsx scripts/check-access-guards.ts --strict",
    allowKeys() {
      const a = json("scripts/access-guards/allowlist.json");
      return ["lowestTierDefault", "activeOrgAccess", "handRolledLadder", "bareRlsList"].flatMap((d) =>
        (a[d] ?? []).map((e) => `${d}|${e.file}|${e.line ?? "*"}`),
      );
    },
    keyShape: /^(lowestTierDefault|activeOrgAccess|handRolledLadder|bareRlsList)\|[^|]+\|(\*|\d+)$/,
  },
  {
    // No allowlist or baseline (exemptions are code rules): every item is new, keyed by file.
    id: "url-state-written-outside-the-canonical-primitive",
    cmd: "pnpm check:url-state",
    allowKeys: () => [],
    keyShape: /^[^|:]+\.tsx?$/,
  },
  {
    // No allowlist or baseline: every item is new, keyed file|table→variable (no line).
    id: "complete-list-reads-postgrest-silently-caps-at-1000",
    cmd: "pnpm check:unbounded-reads",
    allowKeys: () => [],
    keyShape: /^[^|]+\.tsx?\|[^|]+→[^|]+$/,
  },
];

for (const check of CONVERTED) {
  test(`${check.id}: same verdict, names its items, and its keys ARE its allowlist keys`, () => {
    const plainRun = run(check.cmd, false);
    const itemRun = run(check.cmd, true);
    assert.equal(itemRun.code, plainRun.code, `verdict changed: exit ${plainRun.code} → ${itemRun.code}`);
    assert.doesNotMatch(plainRun.out, /MATRX-ITEM /, "a hand run must not print item lines");

    const { items, errors } = parseItems(itemRun.out);
    assert.deepEqual(errors, [], "malformed item lines");
    assert.ok(items.length > 0, `${check.id} printed no MATRX-ITEM lines`);

    const allow = new Set(check.allowKeys());
    const badShape = [...allow, ...items.map((i) => i.key)].filter((k) => !check.keyShape.test(k));
    assert.deepEqual(badShape, [], "keys outside the check's key space");
    const known = items.filter((i) => i.status === "known").map((i) => i.key);
    const fresh = items.filter((i) => i.status === "new").map((i) => i.key);

    const knownNotAllowed = known.filter((k) => !allow.has(k));
    assert.deepEqual(knownNotAllowed, [], "known keys that are not allowlist keys");
    if (check.staleKeys) {
      const stale = new Set(check.staleKeys(itemRun.out));
      const allowedNotEmitted = [...allow].filter((k) => !stale.has(k) && !known.includes(k));
      assert.deepEqual(allowedNotEmitted, [], "allowlist keys the check neither matched nor reported stale");
    } else {
      const unmatched = [...allow].filter((k) => !known.includes(k));
      if (unmatched.length) console.log(`# ${check.id}: ${unmatched.length} allowlist key(s) matched nothing this run (stale?): ${unmatched.slice(0, 5).join(", ")}`);
    }
    const newButAllowed = fresh.filter((k) => allow.has(k));
    assert.deepEqual(newButAllowed, [], "new keys that ARE allowlist keys");
  });
}
