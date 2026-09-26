// converted-checks.test.mjs — every check converted to the item line (C5) keeps its promise.
//
// For each converted check, run it TWICE over the real repository — once as a person runs it, once
// as the runner does (MATRX_ITEMS=1) — and prove:
//   1. the verdict is unchanged: same exit code either way;
//   2. it names its items: at least one item line when it has anything to say;
//   3. KEYS EQUAL THE ALLOWLIST: every `known` key is a key of the check's own allowlist/baseline,
//      and every allowlist/baseline key is emitted as `known` unless the check itself reports that
//      entry as stale (it suppressed nothing this run);
//   4. a `new` key is never an allowlist key (then it would be known);
//   5. BASIS (P2 storage step 0): every `known` item says why — `accepted` exactly for the
//      allowlist entries that carry a reason (`reasonedKeys`), `debt` for the rest;
//   6. END OF SCAN: a full run prints exactly one MATRX-ITEMS-END matching its item lines
//      (`endWhen(out)` names the one honest exception: a run that could not see everything).
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

/** A TypeScript module's export, read through tsx (for allowlists that live in .ts files). */
function tsExport(rel, name) {
  const code = `import(${JSON.stringify(join(ROOT, rel))}).then((m) => console.log(JSON.stringify(m[${JSON.stringify(name)}] ?? m.default?.[${JSON.stringify(name)}])))`;
  const r = spawnSync("pnpm", ["exec", "tsx", "-e", code], { cwd: ROOT, encoding: "utf8" });
  if (r.status !== 0) throw new Error(`tsExport ${rel}#${name}: ${r.stderr}`);
  return JSON.parse(r.stdout.trim().split("\n").pop());
}

/**
 * One row per converted check:
 *   cmd        — the runner's command for it (scripts/run-release-gates.sh --list)
 *   allowKeys  — the check's allowlist/baseline, as the keys the check itself matches on
 *   keyShape   — every allowlist key and every emitted key has this shape (same key space)
 *   staleKeys  — (output) → keys the check reports as stale this run (they cannot be emitted).
 *                A check that reports no staleness omits it: then an allowlist key the run did not
 *                match is listed as a diagnostic (a stale entry to prune), not a failure.
 *   countRatchet — the baseline holds per-key COUNTS: a grown key is `new` AND a baseline key.
 *   mayBeClean   — the check is clean on today's tree, so zero items is the honest answer.
 *   reasonedKeys — the allowlist/baseline keys whose entry carries a reason (basis `accepted`);
 *                  omitted = the check's data holds no reasons, so every known item is `debt`.
 *   endWhen      — (output) → whether this run may print the end-of-scan marker (default: always).
 */
const withReason = (e) => Boolean((e.justification ?? e.reason ?? "").trim());
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
    reasonedKeys() {
      const a = json("scripts/visibility-vocab/allowlist.json");
      return ["retiredSpelling", "collapsedUnion", "onlyYouClaim"].flatMap((d) =>
        (a[d] ?? []).filter(withReason).map((e) => `${d}|${e.file}|${e.line ?? "*"}`),
      );
    },
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
    reasonedKeys() {
      const a = json("scripts/access-guards/allowlist.json");
      return ["lowestTierDefault", "activeOrgAccess", "handRolledLadder", "bareRlsList"].flatMap((d) =>
        (a[d] ?? []).filter(withReason).map((e) => `${d}|${e.file}|${e.line ?? "*"}`),
      );
    },
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
    // An UNMEASURED read may be a finding this run could not see: no end-of-scan then.
    endWhen: (out) => !/\[UNMEASURED\]/.test(out),
  },
  {
    // Baseline: scripts/api-contracts-baseline.json, a list of file paths. Stale = "converted".
    id: "api-contract-ratchet",
    cmd: "pnpm exec tsx scripts/check-api-contracts.ts --strict",
    allowKeys: () => json("scripts/api-contracts-baseline.json"),
    keyShape: /^[^|:\s]+\.tsx?$/,
    staleKeys: (out) => [...out.matchAll(/^\s*✓ (\S+)$/gm)].map((m) => m[1]),
    reasonedKeys() {
      let reasons = {};
      try {
        reasons = json("scripts/api-contracts-baseline.reasons.json");
      } catch {
        /* no accepts yet */
      }
      return Object.entries(reasons).filter(([, v]) => typeof v === "object" && withReason(v)).map(([k]) => k);
    },
  },
  {
    // The registry is a vocabulary, not an allowlist of defects: every item is new, keyed by the
    // registry entry that is missing (registering it fixes every file that stamps it).
    id: "cx-source-attribution-is-registered",
    cmd: "pnpm check:source-attribution",
    allowKeys: () => [],
    keyShape: /^(duplicate:(SOURCE_APPS|SOURCE_FEATURES)=.+|source_(app|feature)=.*)$/,
  },
  {
    // Baseline: scripts/record-toasts.baseline.json `ids` — `<file>::<toast text>` (no line).
    id: "record-naming-toasts-carry-their-record",
    cmd: "pnpm check:record-toasts:strict",
    allowKeys: () => json("scripts/record-toasts.baseline.json").ids,
    keyShape: /^[^:]+\.tsx?::.+$/s,
    reasonedKeys: () => Object.entries(json("scripts/record-toasts.baseline.json").reasons ?? {}).filter(([, v]) => withReason(v)).map(([k]) => k),
  },
  {
    // Accepted by an inline `// access-errors: ok — <reason>` marker, never a key list: all new.
    id: "access-errors-surfaces-that-guess-why-a-read-failed",
    cmd: "pnpm exec tsx scripts/access-errors/check-access-errors.ts",
    allowKeys: () => [],
    keyShape: /^((raw-supabase-message|raw-governed-write|claims-deleted|claims-denied)\|[^|]+|(swallowed|narrowed)\|[^|]+\|[^|]+)$/,
  },
  // ── Batch 2 (2026-09-26) ──────────────────────────────────────────────────────────────────
  {
    // Allowlist: scripts/dead-ends/allowlist.ts — `<file>|<rule or *>`. Every finding is an item,
    // whatever --limit prints.
    id: "no-dead-ends-door-law",
    cmd: "pnpm exec tsx scripts/dead-ends/check-dead-ends.ts",
    allowKeys: () => tsExport("scripts/dead-ends/allowlist.ts", "DEAD_END_ALLOWLIST").map((e) => `${e.file}|${e.rule ?? "*"}`),
    reasonedKeys: () => tsExport("scripts/dead-ends/allowlist.ts", "DEAD_END_ALLOWLIST").filter(withReason).map((e) => `${e.file}|${e.rule ?? "*"}`),
    keyShape: /^[^|]+\|(\*|bare-id-text|unlinked-entity-name|unlinked-count|toast-names-record|no-doors-in-file)$/,
  },
  {
    // Baseline: scripts/type-escape-baseline.json `counts` — one item per category.
    id: "type-escape-hatch-ratchet",
    cmd: "pnpm check:hatches",
    allowKeys: () => Object.keys(json("scripts/type-escape-baseline.json").counts),
    keyShape: /^[a-zA-Z]+$/,
    countRatchet: true,
  },
  {
    // Exemptions are code sets (a finding never exists): every item is new, `<kind>|<file>`.
    id: "ui-primitives-check",
    cmd: "pnpm exec tsx scripts/check-ui-primitives.ts",
    allowKeys: () => [],
    keyShape: /^(raw-input|fake-checkbox|fake-switch|raw-dialog|raw-modal-import)\|[^|]+\.tsx$/,
  },
  {
    // Allowlist: scripts/settings-hardcoded-allowlist.json `entries` — `<file>::<NAME>`.
    id: "settings-new-knob-shaped-constants-ratchet",
    cmd: "pnpm check:settings-hardcoded",
    allowKeys: () => json("scripts/settings-hardcoded-allowlist.json").entries.map((e) => `${e.file}::${e.name}`),
    reasonedKeys: () => json("scripts/settings-hardcoded-allowlist.json").entries.filter(withReason).map((e) => `${e.file}::${e.name}`),
    keyShape: /^[^:]+::[A-Z][A-Z0-9_]+$/,
  },
  {
    // Register: scripts/package-twins.json — `<row>|<census list>|<file>` for census / shapeCensus /
    // inputCensus entries. Stale census entries are printed by the check (name lane and shape lanes).
    id: "package-logic-re-grown-outside-its-package",
    cmd: "pnpm check:package-twins:strict",
    allowKeys: () =>
      json("scripts/package-twins.json").twins.flatMap((row) =>
        ["census", "shapeCensus", "inputCensus"].flatMap((list) => (row[list] ?? []).map((e) => `${row.name}|${list}|${e.file}`)),
      ),
    keyShape: /^[^|]+\|(census|shapeCensus|inputCensus)\|[^|]+$/,
    staleKeys(out) {
      const keys = [...out.matchAll(/^ {2}(\S+) → (\S+)$/gm)].map((m) => `${m[1]}|census|${m[2]}`);
      let lane = null;
      for (const line of out.split("\n")) {
        const head = /stale `(\w+)` entr\(ies\) on `([^`]+)`/.exec(line);
        if (head) lane = { list: head[1], row: head[2] };
        else if (lane && /^ {2}\S+$/.test(line)) keys.push(`${lane.row}|${lane.list}|${line.trim()}`);
        else if (lane && line.trim() !== "") lane = null;
      }
      return keys;
    },
  },
  {
    id: "scroll-chain-clipped-tables-lists",
    cmd: "pnpm exec tsx scripts/check-scroll-chain.ts",
    allowKeys: () => [],
    keyShape: /^(broken-chain\|[^|]+\.tsx|route-clipper\|[^|]+\.tsx\|[^|]+\.tsx)$/,
  },
  {
    // Accepted only by an inline `canonical-*-picker-exempt:` comment: all new, `<rule>|<file>`.
    id: "canonical-agent-model-pickers",
    cmd: "pnpm check:canonical-pickers",
    allowKeys: () => [],
    keyShape: /^(retired-model-picker|model-picker|agent-picker)\|[^|]+$/,
    mayBeClean: true,
  },
  {
    // Exemptions are reasoned path prefixes in the check: all new.
    id: "surfaces-running-an-agent-without-naming-it",
    cmd: "pnpm check:agent-disclosure",
    allowKeys: () => [],
    keyShape: /^((undisclosed|inline-disclosure)\|[^|]+\.tsx?|cross-surface\|.+)$/,
  },
  {
    id: "route-metadata-and-favicons",
    cmd: "pnpm check:route-metadata",
    allowKeys: () => [],
    keyShape: /^(duplicate-registry-entry|shared-favicon-letter|page-not-layout|no-metadata-boundary|bypasses-canonical-helper|no-admin-favicon-letter|unregistered-favicon|overrides-registry-letter)\|\/.*$/,
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
    if (!check.mayBeClean) assert.ok(items.length > 0, `${check.id} printed no MATRX-ITEM lines`);
    else if (items.length === 0) assert.equal(itemRun.code, 0, `${check.id} failed yet named no items`);

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
      const unmatched = [...allow].filter((k) => !known.includes(k) && !fresh.includes(k));
      if (unmatched.length) console.log(`# ${check.id}: ${unmatched.length} allowlist key(s) matched nothing this run (stale?): ${unmatched.slice(0, 5).join(", ")}`);
    }
    if (check.countRatchet) {
      // A count ratchet: every key — grown (new) or not (known) — IS a baseline key.
      assert.deepEqual(fresh.filter((k) => !allow.has(k)), [], "grown keys that are not baseline keys");
    } else {
      const newButAllowed = fresh.filter((k) => allow.has(k));
      assert.deepEqual(newButAllowed, [], "new keys that ARE allowlist keys");
    }

    // 5. basis — accepted exactly where the entry carries a reason; every other known item is debt.
    const reasoned = new Set(check.reasonedKeys ? check.reasonedKeys() : []);
    const wrongBasis = items
      .filter((i) => i.status === "known")
      .filter((i) => i.basis !== (reasoned.has(i.key) ? "accepted" : "debt"))
      .map((i) => `${i.key} → ${i.basis ?? "(none)"}`);
    assert.deepEqual(wrongBasis, [], "known items whose basis does not match their allowlist entry");

    // 6. end of scan — a full run declares it, and only a run that saw everything.
    const { complete } = parseItems(itemRun.out);
    const mayEnd = check.endWhen ? check.endWhen(itemRun.out) : true;
    assert.equal(complete, mayEnd, mayEnd ? "a full scan did not print a matching MATRX-ITEMS-END" : "a partial scan printed MATRX-ITEMS-END");
  });
}

// F6: a narrowed run sees a slice of the tree, so it must never declare the end of a scan — else
// every key outside the slice would read as fixed.
test("a narrowed run names its items but never prints the end-of-scan marker", () => {
  const sliced = run("pnpm exec tsx scripts/dead-ends/check-dead-ends.ts --path=features/notes", true);
  const { errors, complete } = parseItems(sliced.out);
  assert.deepEqual(errors, []);
  assert.equal(complete, false, "a --path run printed MATRX-ITEMS-END");
  assert.doesNotMatch(sliced.out, /MATRX-ITEMS-END/);
});
