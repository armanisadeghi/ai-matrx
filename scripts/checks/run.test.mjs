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

import { EXTRA_ROWS, categorize, fingerprint, judge, parseRows, renderTable } from "./run.mjs";

const RUNNER = new URL("./run.mjs", import.meta.url).pathname;

function runWithManifest(rows, extraArgs = []) {
  const dir = mkdtempSync(join(tmpdir(), "release-checks-"));
  const manifest = join(dir, "rows.txt");
  const json = join(dir, "findings.jsonl");
  writeFileSync(manifest, rows.join("\n") + "\n");
  const out = execFileSync("node", [RUNNER, "--manifest", manifest, "--json", json, "--timeout", "2", ...extraArgs], {
    encoding: "utf8",
  });
  const lines = readFileSync(json, "utf8").trim().split("\n").map((l) => JSON.parse(l));
  return { out, header: lines[0], findings: lines.slice(1) };
}

test("a clean run is one line and an empty findings file behind the ran header", () => {
  const { out, header, findings } = runWithManifest(["Clean gate|true", "Another clean gate|echo all good"]);
  assert.equal(out.trim().split("\n").length, 1);
  assert.match(out, /^checks: 2 run, 0 findings \([^)]+\)$/m);
  assert.deepEqual(header, { ran: ["clean-gate", "another-clean-gate"] });
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

test("parseRows keeps duplicate labels distinct only when their commands differ, and slugs ids", () => {
  const rows = parseRows(["Same|pnpm a", "Same|pnpm a", "Same|pnpm b", "# comment", "", "no bar here"]);
  assert.deepEqual(rows.map((r) => r.id), ["same", "same-pnpm-b"]);
  assert.equal(rows[0].level, "warning");
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
  const out = execFileSync("node", [RUNNER, "--manifest", manifest, "--list"], { encoding: "utf8" });
  assert.match(out, /^touches-a-file\t/m);
  assert.throws(() => readFileSync(marker));
});

test("a row's database class is DECLARED by the manifest, never guessed from its label", () => {
  const rows = parseRows(
    ["Live door rows guard|pnpm check:x", "Innocent-sounding label|pnpm check:y", "Nobody classified me|true"],
    { "live-door-rows-guard": { class: "repo-only" }, "innocent-sounding-label": { class: "live-db" } },
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
  const classes = join(dir, "classes.json");
  writeFileSync(
    classes,
    JSON.stringify({ rows: { "live-gate": { class: "live-db" }, "repo-gate": { class: "repo-only" }, "clone-gate": { class: "clone-db" } } }),
  );
  const { out, header, findings } = runWithManifest(
    [`Live gate|touch ${marker("live")}`, `Repo gate|touch ${marker("repo")}`, `Clone gate|touch ${marker("clone")}`, `Unknown gate|touch ${marker("unknown")}`],
    ["--classes", classes, "--skip-live-db"],
  );
  assert.equal(existsSync(marker("live")), false, "a live-db row executed");
  assert.equal(existsSync(marker("unknown")), false, "an unclassified row executed");
  assert.equal(existsSync(marker("repo")), true);
  assert.equal(existsSync(marker("clone")), true);
  assert.match(out, /^checks: skipped 2 live-db rows \(1 unclassified \S+ run pnpm checks:classify\); they live in .*REGISTER\.md/m);
  assert.deepEqual(header, { ran: ["repo-gate", "clone-gate"], skipped_live_db: ["live-gate", "unknown-gate"] });
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
