// run.test.mjs — the ONE release-check runner, at its seams.
//
// Drives scripts/checks/run.mjs over a manifest of throwaway rows (a clean
// one, a failing one, one that screams while exiting 0, one that cannot start,
// one that hangs) and proves: a check never changes the exit code, a clean run
// is one line, every finding is one JSON line in the dispatcher's shape behind
// a `{"ran":[...]}` header, a scream over exit 0 is a finding (the thirteen
// green-over-findings gates of 2026-08-29), and a hang becomes a warning that
// says so. `pnpm test:release-checks`.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { EXTRA_ROWS, categorize, fingerprint, judge, parseRows, renderTable, slug } from "./run.mjs";

const RUNNER = new URL("./run.mjs", import.meta.url).pathname;

// A row's id is DECLARED (row-classes.json), never derived from its label. These throwaway rows
// are declared here, under the id their label would have been born with.
function declareRows(rows, dir, classOf = () => undefined) {
  const declared = {};
  for (const row of rows) {
    const bar = row.indexOf("|");
    const label = row.slice(0, bar).trim();
    const cls = classOf(slug(label));
    declared[slug(label)] = { ...(cls ? { class: cls } : {}), label, cmd: row.slice(bar + 1).trim() };
  }
  const path = join(dir, "classes.json");
  writeFileSync(path, JSON.stringify({ rows: declared }));
  return path;
}

function runWithManifest(rows, extraArgs = []) {
  const dir = mkdtempSync(join(tmpdir(), "release-checks-"));
  const manifest = join(dir, "rows.txt");
  const json = join(dir, "findings.jsonl");
  writeFileSync(manifest, rows.join("\n") + "\n");
  const classes = extraArgs.includes("--classes") ? [] : ["--classes", declareRows(rows, dir)];
  const out = execFileSync("node", [RUNNER, "--manifest", manifest, "--json", json, "--timeout", "2", ...classes, ...extraArgs], {
    encoding: "utf8",
  });
  const lines = readFileSync(json, "utf8").trim().split("\n").map((l) => JSON.parse(l));
  return { out, header: lines[0], findings: lines.slice(1) };
}

test("a clean run is one line and an empty findings file behind the ran header", () => {
  const { out, header, findings } = runWithManifest(["Clean gate|true", "Another clean gate|echo all good"]);
  assert.equal(out.trim().split("\n").length, 1);
  assert.match(out, /^checks: 2 run, 0 findings \([^)]+\)$/m);
  // The run's own commit and start, and each real run's measurement (P2-STORAGE-VERIFY V4/V5).
  const { git_sha, started_at, checks, ...rest } = header;
  assert.match(git_sha, /^[0-9a-f]{40}$/);
  assert.ok(!Number.isNaN(Date.parse(started_at)));
  assert.deepEqual(Object.keys(checks).sort(), ["another-clean-gate", "clean-gate"]);
  for (const m of Object.values(checks)) {
    assert.equal(m.exit, 0);
    assert.equal(m.timed_out, false);
    assert.ok(Number.isInteger(m.duration_ms) && !Number.isNaN(Date.parse(m.started_at)));
  }
  assert.deepEqual(rest, { ran: ["clean-gate", "another-clean-gate"] });
  assert.equal(findings.length, 0);
});

test("a failing row, a screaming row, an unstartable row and a hang are findings; the exit code stays 0", () => {
  const { out, findings } = runWithManifest([
    "Exit code one|echo boom; exit 1",
    "Green over findings|echo '[WARN] 3 violations'; exit 0",
    "Cannot start|/nonexistent/binary --flag",
    "Hangs forever|sleep 30",
  ]);
  assert.match(out, /^LEVEL\s+CATEGORY\s+FINDING\s+COUNT\s+REMEDY$/m);
  assert.match(out, /checks: 4 run, 4 findings/);
  const byCheck = Object.fromEntries(findings.map((f) => [f.check, f]));
  assert.match(byCheck["exit-code-one"].title, /Exit code one: boom/);
  assert.match(byCheck["green-over-findings"].title, /\[WARN\] 3 violations/);
  assert.match(byCheck["hangs-forever"].title, /could not run: timed out after 2s/);
  assert.equal(byCheck["hangs-forever"].level, "warning");
  assert.match(byCheck["cannot-start"].title, /No such file or directory/);
  for (const f of findings) {
    assert.deepEqual(Object.keys(f), ["check", "category", "level", "title", "count", "fingerprint", "remedy", "detail"]);
    assert.ok(f.title.length <= 100);
    assert.match(f.fingerprint, /^[0-9a-f]{40}$/);
    assert.equal(f.fingerprint, fingerprint(f.check, f.title));
    assert.ok(f.remedy.length > 0, "the remedy is the command that re-runs the check");
    assert.ok(f.detail.endsWith(`${f.check}.log`), "the detail points at the check's own log");
  }
});

test("a title's digits do not change its fingerprint (the same defect on two releases is one finding)", () => {
  assert.equal(fingerprint("x", "Ratchet exceeded: 136 rows"), fingerprint("x", "Ratchet exceeded: 137 rows"));
});

test("judge: exit 0 with no scream is clean; a scream over exit 0 is not", () => {
  const row = { label: "Gate" };
  assert.equal(judge(row, 0, "all fine\n"), null);
  assert.deepEqual(judge(row, 0, "x\nCANONICAL RATCHET EXCEEDED\ny\n[LOUD] more\n"), {
    title: "Gate: CANONICAL RATCHET EXCEEDED",
    count: 2,
  });
  assert.match(judge(row, 1, "[31mred text[0m\n").title, /^Gate: red text$/);
});

test("parseRows: one row per command; a new row is born with its label's slug only when classify declares it", () => {
  const lines = ["Same|pnpm a", "Same|pnpm a", "Same|pnpm b", "# comment", "", "no bar here"];
  assert.deepEqual(parseRows(lines, {}, { mint: true }).map((r) => r.id), ["same", "same-pnpm-b"]);
  assert.equal(parseRows(lines, {}, { mint: true })[0].level, "warning");
  // The runner never mints: a row nobody declared says so in its id (and the row-classes guard fails).
  assert.deepEqual(parseRows(lines, {}).map((r) => r.id), ["undeclared-same", "undeclared-same-pnpm-b"]);
});

// F8 (P2-STORAGE-ATTACK): a check's id was slug(label), so editing a label orphaned every item
// the check had ever named and re-opened them all under a new id.
test("a row's id is DECLARED: a relabelled row keeps its id; a command edit keeps it through the label", () => {
  const declared = { "door-rows-guard": { class: "repo-only", label: "Door rows guard", cmd: "pnpm check:door-rows" } };
  const relabelled = parseRows(["Every door row is bounded (renamed)|pnpm check:door-rows"], declared);
  assert.equal(relabelled[0].id, "door-rows-guard");
  assert.equal(relabelled[0].dbClass, "repo-only");
  const recommanded = parseRows(["Door rows guard|pnpm check:door-rows --strict"], declared);
  assert.equal(recommanded[0].id, "door-rows-guard");
  // Both edited at once is a new row — undeclared until classify declares it.
  assert.equal(parseRows(["Something else|pnpm check:other"], declared)[0].id, "undeclared-something-else");
});

test("the old pre-push gates are rows now, and the migration ledger is an ERROR row", () => {
  const rows = parseRows(EXTRA_ROWS);
  const cmds = rows.map((r) => r.cmd);
  for (const needle of ["pnpm check:matrx-packages", "pnpm check:organization-context", "pnpm check:client-initiation", "pnpm check:migration-judgment", "scripts/check-release-surface-registration.ts"]) {
    assert.ok(cmds.some((c) => c.includes(needle)), `${needle} must be a row`);
  }
  assert.equal(rows.find((r) => r.cmd === "pnpm check:migrations:strict").level, "error");
  assert.equal(rows.find((r) => r.cmd === "pnpm check:migrations:strict").category, "migrations");
});

test("categories: lanes the dispatcher knows", () => {
  assert.equal(categorize("Migration ledger check", "pnpm exec tsx scripts/check-migrations.ts"), "migrations");
  assert.equal(categorize("RLS policies that read their own table", "pnpm check:rls-self-reference"), "access");
  assert.equal(categorize("The __kind marker law (no stripping)", "pnpm check:kind-marker-law"), "kinds");
  assert.equal(categorize("Hand-typed mandate keys", "pnpm check:mandate-keys"), "mandates");
  assert.equal(categorize("Settings: knob reads with no registry row", "pnpm check:settings-unregistered"), "settings");
});

test("the table sorts errors first", () => {
  const table = renderTable([
    { level: "warning", category: "ui", check: "a", title: "w", count: 1, remedy: "r" },
    { level: "error", category: "boot", check: "b", title: "e", count: 2, remedy: "r" },
  ]);
  const lines = table.split("\n");
  assert.match(lines[1], /^ERROR/);
  assert.match(lines[2], /^WARNING/);
});

test("a passing self-test that quotes the failure token is not a finding", () => {
  const row = { label: "Unbounded reads self-test" };
  const passed = [
    "[self-test] PASS  two hops in ONE file: no finding, and an UNMEASURED line naming the second hop",
    "[self-test] PASS � the rule REPORTS AS UNMEASURED the two hops it cannot follow",
  ].join("\n");
  assert.equal(judge(row, 0, passed), null);
  const real = judge(row, 0, "[UNMEASURED] 84 complete-list decision(s) this sweep could NOT judge\n");
  assert.ok(real);
  assert.equal(real.count, 1);
});

test("--list prints every row and runs nothing", () => {
  const dir = mkdtempSync(join(tmpdir(), "release-checks-"));
  const manifest = join(dir, "rows.txt");
  const marker = join(dir, "ran");
  writeFileSync(manifest, `Touches a file|touch ${marker}\n`);
  const out = execFileSync("node", [RUNNER, "--manifest", manifest, "--list", "--classes", declareRows([`Touches a file|touch ${marker}`], dir)], { encoding: "utf8" });
  assert.match(out, /^touches-a-file\t/m);
  assert.throws(() => readFileSync(marker));
});

test("a row's database class is DECLARED by the manifest, never guessed from its label", () => {
  const rows = parseRows(
    ["Live door rows guard|pnpm check:x", "Innocent-sounding label|pnpm check:y", "Nobody classified me|true"],
    { "live-door-rows-guard": { class: "repo-only", cmd: "pnpm check:x" }, "innocent-sounding-label": { class: "live-db", cmd: "pnpm check:y" }, "nobody-classified-me": { cmd: "true" } },
  );
  const by = Object.fromEntries(rows.map((r) => [r.id, r]));
  assert.equal(by["live-door-rows-guard"].dbClass, "repo-only");
  assert.equal(by["live-door-rows-guard"].needsDb, false, "a label saying live / door / db decides nothing");
  assert.equal(by["innocent-sounding-label"].dbClass, "live-db");
  assert.equal(by["innocent-sounding-label"].needsDb, true);
  assert.equal(by["nobody-classified-me"].dbClass, "unclassified");
  assert.equal(by["nobody-classified-me"].needsDb, true, "an unclassified row takes the safe side");
});

test("--skip-live-db runs no live-db or unclassified row and says so in one line", () => {
  const dir = mkdtempSync(join(tmpdir(), "release-checks-skip-"));
  const marker = (name) => join(dir, `${name}-ran`);
  const rows = [`Live gate|touch ${marker("live")}`, `Repo gate|touch ${marker("repo")}`, `Clone gate|touch ${marker("clone")}`, `Unknown gate|touch ${marker("unknown")}`];
  const classes = declareRows(rows, dir, (id) => ({ "live-gate": "live-db", "repo-gate": "repo-only", "clone-gate": "clone-db" })[id]);
  const { out, header, findings } = runWithManifest(rows, ["--classes", classes, "--skip-live-db"]);
  assert.equal(existsSync(marker("live")), false, "a live-db row executed");
  assert.equal(existsSync(marker("unknown")), false, "an unclassified row executed");
  assert.equal(existsSync(marker("repo")), true);
  assert.equal(existsSync(marker("clone")), true);
  assert.match(out, /^checks: skipped 2 live-db rows \(1 unclassified \S+ run pnpm checks:classify\); they live in .*REGISTER\.md/m);
  const { git_sha: _sha, started_at: _at, checks: _m, ...rest } = header;
  assert.deepEqual(rest, { ran: ["repo-gate", "clone-gate"], skipped_live_db: ["live-gate", "unknown-gate"] });
  assert.equal(findings.length, 0);
});

// 2026-09-25: fifteen release findings read only "ELIFECYCLE Command failed with exit code 1" —
// the title was the LAST line of output, which for every `pnpm <script>` row is pnpm's own
// trailer. A title must say WHAT the check found: its headline and the first offender.
test("a failing row's title is its headline and first offender, never pnpm's ELIFECYCLE trailer", () => {
  const row = { label: "Record-naming toasts carry their record" };
  const out = [
    "> app-matrx@0.4.2354 check:record-toasts:strict /repo",
    "> tsx scripts/check-record-toasts.ts --strict",
    "",
    "[check:record-toasts] 336 record-naming toast(s) outside the helper; 90 NOT baselined.",
    "  components/agent-copy/useExportActions.ts:27  toast.success(`Created`) — route it through recordToast",
    "  lib/durable-run/durableRunDialogClose.ts:58  toast.info(`still running`) — route it through recordToast",
    " ELIFECYCLE  Command failed with exit code 1.",
  ].join("\n");
  const verdict = judge(row, 1, out);
  assert.doesNotMatch(verdict.title, /ELIFECYCLE|Command failed/);
  assert.match(verdict.title, /^Record-naming toasts carry their record: 336 record-naming/);
  assert.match(verdict.title, / \u2014 first useExportActions\.ts:27$/, "the first offender is named");
  assert.ok(verdict.title.length <= 100);
  assert.equal(verdict.count, 2, "count is the offenders listed, not 1");
});

test("a headline ending in a colon carries its first item; tsc errors name their file", () => {
  const pkgs = judge({ label: "Every @ai-matrx package is declared and installed at npm latest" }, 1, [
    "✓ @ai-matrx/alchemy@0.3.6 is npm latest.",
    "@ai-matrx install-graph check failed:",
    "  - STALE: @ai-matrx/agents@0.13.10 is in the graph; npm latest is 0.13.13.",
    "  - STALE: @ai-matrx/content-ir@0.18.4 is in the graph; npm latest is 0.18.5.",
    " ELIFECYCLE  Command failed with exit code 1.",
  ].join("\n"));
  assert.match(pkgs.title, /install-graph check failed: STALE: @ai-matrx\//);
  const tsc = judge({ label: "TypeScript type-check" }, 2, [
    "[tsc-capped] 2 type-check(s) already running on this machine \u2014 waiting for a free slot (0s)\u2026",
    "features/a/b.tsx(12,5): error TS2322: Type 'string' is not assignable to type 'number'.",
    "lib/c.ts(3,1): error TS2304: Cannot find name 'x'.",
    " ELIFECYCLE  Command failed with exit code 2.",
  ].join("\n"));
  assert.match(tsc.title, /^TypeScript type-check: features\/a\/b\.tsx\(12,5\): error TS2322/);
  assert.equal(tsc.count, 2);
});

test("a line the check marks as its failure is the headline, even when every line is indented", () => {
  const verdict = judge({ label: "Generated API types are fresh" }, 1, [
    "  check:api-types-fresh \u2014 regenerating the contract from the aidream checkout to compare...",
    "  \u2717 THE COMMITTED GENERATED API CONTRACT IS NOT WHAT THE GENERATOR PRODUCES.",
    "    \u2022 types/python-generated/openapi.json does not describe the aidream checkout.",
    " ELIFECYCLE  Command failed with exit code 1.",
  ].join("\n"));
  assert.match(verdict.title, /^Generated API types are fresh: THE COMMITTED GENERATED API CONTRACT/);
});

test("the same defect with a different first offender keeps its fingerprint", () => {
  assert.equal(
    fingerprint("x", "Gate: 3 findings — first features/a/b.ts:12"),
    fingerprint("x", "Gate: 4 findings — first lib/c/d.tsx:7"),
  );
});

// ── C5: items before inflow (common-docs/projects/checks-run-in-the-app/ITEM-PROTOCOL.md) ─────────
import { emitItem, itemFingerprint, parseItems } from "./items.mjs";

const ITEM = (json) => `[ "$MATRX_ITEMS" = 1 ] && echo 'MATRX-ITEM ${JSON.stringify(json)}'`;

test("items: a check that names its items gets ONE finding per item, keyed by the item, with its ratchet flag", () => {
  const cmd = [
    ITEM({ key: "retiredSpelling|a.ts|*", status: "new", title: "a.ts uses 'shared'", file: "a.ts", line: 3 }),
    ITEM({ key: "retiredSpelling|a.ts|*", status: "known" }),
    ITEM({ key: "onlyYou|b.tsx|*", status: "new", file: "b.tsx" }),
    ITEM({ key: "onlyYou|c.tsx|*", status: "known", file: "c.tsx" }),
    "echo '[FAIL] a.ts:3'; exit 1",
  ].join("; ");
  const { out, header, findings } = runWithManifest([`Itemized gate|${cmd}`]);
  // No summary finding: the items ARE the finding. The repeated key is one item, counted twice,
  // and "new" wins over "known" for it (one uncovered occurrence is not accepted debt).
  assert.equal(findings.length, 3, JSON.stringify(findings));
  const byKey = Object.fromEntries(findings.map((f) => [f.item_key, f]));
  assert.equal(byKey["retiredSpelling|a.ts|*"].ratchet, "new");
  assert.equal(byKey["retiredSpelling|a.ts|*"].count, 2);
  assert.equal(byKey["retiredSpelling|a.ts|*"].file, "a.ts");
  assert.equal(byKey["retiredSpelling|a.ts|*"].line, 3);
  assert.equal(byKey["onlyYou|c.tsx|*"].ratchet, "known");
  for (const f of findings) {
    assert.equal(f.check, "itemized-gate");
    assert.equal(f.fingerprint, itemFingerprint("itemized-gate", f.item_key));
    assert.equal(f.remedy, cmd);
  }
  assert.deepEqual(header.items, { "itemized-gate": { new: 2, known: 1 } });
  // The terminal stays one row per check, never one per item.
  assert.equal(out.trim().split("\n").length, 3, out);
  assert.match(out, /2 new, 1 known/);
});

test("items: an item's fingerprint survives a different count, order and title", () => {
  assert.equal(itemFingerprint("x", "k"), itemFingerprint("x", "k"));
  assert.notEqual(itemFingerprint("x", "k"), itemFingerprint("y", "k"));
  assert.notEqual(itemFingerprint("x", "k"), fingerprint("x", "k"));
  const a = parseItems('MATRX-ITEM {"key":"k1","title":"3 hits"}\nMATRX-ITEM {"key":"k2"}');
  const b = parseItems('MATRX-ITEM {"key":"k2"}\nMATRX-ITEM {"key":"k1","title":"4 hits"}\nMATRX-ITEM {"key":"k1"}');
  assert.deepEqual(a.items.map((i) => i.key).sort(), b.items.map((i) => i.key).sort());
});

test("items: a failing check whose items are ALL known keeps its summary finding (a failure is never hidden)", () => {
  const cmd = `${ITEM({ key: "t1", status: "known" })}; echo 'stale allowlist entry: t9'; exit 1`;
  const { findings } = runWithManifest([`Known only|${cmd}`]);
  assert.equal(findings.filter((f) => f.item_key).length, 1);
  const summary = findings.filter((f) => !f.item_key);
  assert.equal(summary.length, 1, JSON.stringify(findings));
  assert.equal(summary[0].fingerprint, fingerprint(summary[0].check, summary[0].title));
});

test("items: a clean check still reports its known debt in the JSON, and prints nothing", () => {
  const cmd = `${ITEM({ key: "debt-1", status: "known" })}; ${ITEM({ key: "debt-2", status: "known" })}; true`;
  const { out, header, findings } = runWithManifest([`Clean with debt|${cmd}`]);
  assert.equal(out.trim().split("\n").length, 1, out);
  assert.equal(findings.length, 2);
  assert.ok(findings.every((f) => f.ratchet === "known"));
  assert.deepEqual(header.items, { "clean-with-debt": { new: 0, known: 2 } });
});

test("items: a malformed item line is a warning finding, never silently dropped", () => {
  const cmd = `echo 'MATRX-ITEM {not json'; echo 'MATRX-ITEM {"status":"new"}'; ${ITEM({ key: "ok" })}; exit 1`;
  const { findings } = runWithManifest([`Bad items|${cmd}`]);
  const bad = findings.find((f) => /malformed MATRX-ITEM/.test(f.title));
  assert.ok(bad, JSON.stringify(findings));
  assert.equal(bad.count, 2);
  assert.equal(bad.level, "warning");
  assert.ok(findings.some((f) => f.item_key === "ok" && f.ratchet === "new"));
});

test("items: a check prints item lines only when the runner asks (MATRX_ITEMS=1)", () => {
  const lines = [];
  emitItem({ key: "k" }, { env: {}, write: (s) => lines.push(s) });
  assert.equal(lines.length, 0);
  emitItem({ key: "k", status: "known", line: 4 }, { env: { MATRX_ITEMS: "1" }, write: (s) => lines.push(s) });
  assert.deepEqual(lines, ['MATRX-ITEM {"key":"k","status":"known","line":4}\n']);
  assert.throws(() => emitItem({ key: "" }, { env: { MATRX_ITEMS: "1" }, write: () => {} }), /no key/);
  assert.throws(() => emitItem({ key: "k", status: "old" }, { env: { MATRX_ITEMS: "1" }, write: () => {} }), /not new\|known/);
});

test("items: the fingerprint vector is identical to aidream's runner (tests/test_check_runner_items.py)", () => {
  assert.equal(itemFingerprint("visibility-vocabulary", "onlyYouClaim|a.tsx|*"), "997499345e4cd7772cd7aa6b481902bc1c8584f9");
});

test("items: a self-test row is never asked for items (its planted fixtures are not the repo's items)", () => {
  const cmd = `${ITEM({ key: "planted" })}; echo "[self-test] PASS planted caught"; exit 0 # --self-test`;
  const { findings, header } = runWithManifest([`Guard self-test|${cmd}`]);
  assert.equal(findings.length, 0, JSON.stringify(findings));
  assert.equal(header.items, undefined);
});

// ── P2 storage v2 step 0 — basis, unit, end-of-scan (P2-STORAGE-ATTACK F5/F6/F10/F12) ─────────────
import { endItems, itemUnit } from "./items.mjs";

const END = (count) => `[ "$MATRX_ITEMS" = 1 ] && echo 'MATRX-ITEMS-END {"count":${count}}'`;

test("basis: a known item says whether it is a reasoned accept or grandfathered debt; the tally splits them", () => {
  const cmd = [
    ITEM({ key: "a", status: "known", basis: "accepted" }),
    ITEM({ key: "d", status: "known", basis: "debt" }),
    ITEM({ key: "u", status: "known" }),
    ITEM({ key: "n", status: "new" }),
    "exit 1",
  ].join("; ");
  const { header, findings } = runWithManifest([`Based gate|${cmd}`]);
  const byKey = Object.fromEntries(findings.filter((f) => f.item_key).map((f) => [f.item_key, f]));
  assert.equal(byKey.a.basis, "accepted");
  assert.equal(byKey.d.basis, "debt");
  assert.equal(byKey.u.basis, undefined, "a check that cannot tell says nothing");
  assert.equal(byKey.n.basis, undefined);
  assert.deepEqual(header.items, { "based-gate": { new: 1, known: 3, accepted: 1, debt: 1 } });
});

test("basis: only on a known item, only accepted|debt; mixed occurrences of one key read as debt", () => {
  const w = { env: { MATRX_ITEMS: "1" }, write: () => {} };
  assert.throws(() => emitItem({ key: "k", status: "new", basis: "debt" }, w), /only for a known item/);
  assert.throws(() => emitItem({ key: "k", status: "known", basis: "grandfathered" }, w), /not accepted\|debt/);
  const { items } = parseItems(['MATRX-ITEM {"key":"k","status":"known","basis":"accepted"}', 'MATRX-ITEM {"key":"k","status":"known","basis":"debt"}'].join("\n"));
  assert.equal(items[0].basis, "debt");
  const lines = [];
  emitItem({ key: "k", status: "known", basis: "accepted", unit: "public.t" }, { ...w, write: (s) => lines.push(s) });
  assert.deepEqual(lines, ['MATRX-ITEM {"key":"k","status":"known","basis":"accepted","unit":"public.t"}\n']);
});

test("unit: every item finding carries its work unit — check × (emitter unit, else file, rule, key)", () => {
  const cmd = [ITEM({ key: "k1", unit: "public.orders", file: "a.ts" }), ITEM({ key: "k2", file: "b.ts", rule: "r" }), ITEM({ key: "k3", rule: "r" }), ITEM({ key: "k4" })].join("; ");
  const { findings } = runWithManifest([`Unit gate|${cmd}`]);
  const unit = Object.fromEntries(findings.map((f) => [f.item_key, f.unit]));
  assert.deepEqual(unit, { k1: "unit-gate|public.orders", k2: "unit-gate|b.ts", k3: "unit-gate|r", k4: "unit-gate|k4" });
  assert.equal(itemUnit("c", { key: "k", unit: "", file: "", rule: "" }), "c|k");
});

test("end-of-scan: only a run that printed ONE marker matching its item lines is scan_complete", () => {
  const two = `${ITEM({ key: "a" })}; ${ITEM({ key: "a" })}; ${ITEM({ key: "b" })}`;
  const { header, findings } = runWithManifest([
    `Complete gate|${two}; ${END(3)}; true`,
    `Clean complete gate|${END(0)}; true`,
    `Truncated gate|${two}; true`,
    `Lost lines gate|${two}; ${END(5)}; true`,
    `Twice gate|${two}; ${END(3)}; ${END(3)}; true`,
  ]);
  assert.deepEqual(header.scan_complete, { "complete-gate": 3, "clean-complete-gate": 0 });
  assert.equal(findings.filter((f) => f.check === "clean-complete-gate").length, 0, "the marker is a record, never a finding");
});

test("end-of-scan: endItems prints only when asked, with the item lines this process printed", () => {
  const lines = [];
  const w = { env: { MATRX_ITEMS: "1" }, write: (s) => lines.push(s) };
  endItems({ env: {}, write: (s) => lines.push(s) });
  assert.equal(lines.length, 0);
  emitItem({ key: "x" }, w);
  emitItem({ key: "y" }, w);
  lines.length = 0;
  endItems(w);
  const printed = Number(JSON.parse(lines[0].slice("MATRX-ITEMS-END ".length)).count);
  assert.ok(printed >= 2, lines[0]);
  const parsed = parseItems(['MATRX-ITEM {"key":"x"}', 'MATRX-ITEM {"key":"y"}', 'MATRX-ITEMS-END {"count":2}'].join("\n"));
  assert.equal(parsed.complete, true);
  assert.equal(parseItems('MATRX-ITEM {"key":"x"}').complete, false);
  assert.equal(parseItems('MATRX-ITEM {"key":"x"}\nMATRX-ITEMS-END {"count":"x"}').errors.length, 1);
});
