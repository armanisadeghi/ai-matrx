#!/usr/bin/env node
/**
 * jest-health — how many jest suites are red on this checkout, BY CLASS, in one
 * screen.
 *
 * WHY IT EXISTS. `package.json`'s `"test"` script is run by exactly one thing:
 * `scripts/run-release-gates.sh`, which `scripts/release.sh` invokes as
 * `--advisory || true`. So the whole battery screams and blocks nothing, and CI
 * runs four hand-picked scopes that cannot see the rest. The result is a number
 * nobody holds: 32 red suites on 2026-09-08, zero on 2026-09-09, 31 on
 * 2026-09-18, 12 on 2026-09-19. Each census found the previous one's list had
 * already churned. A COUNT nobody prints is a count nobody owns.
 *
 * WHAT IT PRINTS. The failing suites grouped by the class that actually causes
 * them, because the class is what gets fixed:
 *
 *   contract-change  a guard that is RIGHT and named a widened enum, a new
 *                    column, a new window, a sibling repo's moved model
 *   harness          the seat is wrong: a missing provider, a missing reducer,
 *                    a store the component outgrew
 *   time-bomb        a fixture pinned to a calendar date, compared against
 *                    `new Date()` — green the day it was written, red the next
 *   flaky            a wall-clock sleep or a compile inside a test's own
 *                    timeout: passes alone, fails under the full battery
 *   env              a live service, credential or sibling checkout is absent
 *                    (these must SKIP with the reason on screen, never fake)
 *   unclassified     everything else — read it yourself
 *
 * IT IS A SIGNAL, NEVER A GATE. It exits 0 whatever it finds (`--strict` flips
 * that for a human running it deliberately). CI that goes red on a number has
 * historically been turned off; CI that prints one gets read.
 *
 *   node scripts/jest-health.mjs                 # run the suite, print the census
 *   node scripts/jest-health.mjs --strict        # same, exit 1 when any suite is red
 *   node scripts/jest-health.mjs --json <file>   # classify an existing `jest --json` report
 *   node scripts/jest-health.mjs --self-test     # prove the classifier on known shapes
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/**
 * The classes, in priority order — the FIRST match wins, so the more specific
 * signature must come first. Each `match` reads a failing suite's combined
 * failure text (suite-level message plus every assertion's first lines).
 */
const CLASSES = [
  {
    name: "env",
    why: "a live service, credential or sibling checkout is absent",
    match: (text) =>
      /UNMEASURED|ECONNREFUSED|ENOTFOUND|getaddrinfo|SUPABASE_ACCESS_TOKEN|no such file or directory.*(aidream|common-docs)/i.test(
        text,
      ),
  },
  {
    name: "flaky",
    why: "a wall-clock wait or an in-test compile: passes alone, fails under load",
    match: (text) =>
      /Exceeded timeout of \d+ ms for a test|Exceeded timeout of \d+ ms for a hook|jest\.setTimeout|Timeout - Async callback was not invoked/i.test(
        text,
      ),
  },
  {
    name: "harness",
    why: "the test seat is wrong — a missing provider, reducer or store",
    match: (text) =>
      /No .*Provider above this component|Could not find "store"|Invalid hook call|Cannot read properties of undefined \(reading '[a-zA-Z_]+'\)|not wrapped in act|useContext\)/i.test(
        text,
      ),
  },
  {
    name: "time-bomb",
    why: "a fixture pinned to a calendar date, compared against `new Date()`",
    match: (text) =>
      /20\d\d-\d\d-\d\dT\d\d:\d\d/.test(text) &&
      /Nothing on your calendar|ago|Today|Tomorrow|refresh|stale/i.test(text),
  },
  {
    name: "contract-change",
    why: "a guard that is RIGHT: an enum, column, route or sibling model moved",
    match: (text) =>
      /Remedy:|remedy|add the column|must gain|no longer declares|baseline|census/i.test(
        text,
      ),
  },
];

const UNCLASSIFIED = {
  name: "unclassified",
  why: "read it yourself — the classifier has no signature for this",
};

/** The failure text this classifier reads for one suite of a `jest --json` report. */
export function failureTextOf(suite) {
  const parts = [];
  if (suite.message) parts.push(suite.message);
  for (const assertion of suite.assertionResults ?? []) {
    if (assertion.status !== "failed") continue;
    parts.push(assertion.fullName ?? "");
    for (const message of assertion.failureMessages ?? []) {
      parts.push(message.split("\n").slice(0, 12).join("\n"));
    }
  }
  return parts.join("\n");
}

export function classify(text) {
  for (const klass of CLASSES) {
    if (klass.match(text)) return klass.name;
  }
  return UNCLASSIFIED.name;
}

/** The first line a person should read for a failing suite. */
function firstErrorLine(text) {
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (/^(●|at |expect\()/.test(trimmed)) continue;
    return trimmed.slice(0, 200);
  }
  return "(no error text in the report)";
}

function report(json) {
  const failing = (json.testResults ?? []).filter((suite) => suite.status === "failed");
  const byClass = new Map();
  for (const suite of failing) {
    const text = failureTextOf(suite);
    const name = classify(text);
    if (!byClass.has(name)) byClass.set(name, []);
    byClass.get(name).push({
      file: path.relative(ROOT, suite.name),
      line: firstErrorLine(text),
    });
  }

  const total = json.numTotalTestSuites ?? 0;
  const red = failing.length;
  console.log("");
  console.log(`jest-health — ${red} failing of ${total} suites`);
  console.log(`              ${json.numFailedTests ?? 0} failing of ${json.numTotalTests ?? 0} tests`);
  console.log("");
  if (red === 0) {
    console.log("  Zero red. Every suite in the repo, not CI's four scopes.");
    console.log("");
    return 0;
  }
  for (const klass of [...CLASSES, UNCLASSIFIED]) {
    const rows = byClass.get(klass.name);
    if (!rows?.length) continue;
    console.log(`  ${klass.name} (${rows.length}) — ${klass.why}`);
    for (const row of rows) {
      console.log(`    ${row.file}`);
      console.log(`      ${row.line}`);
    }
    console.log("");
  }
  return red;
}

function runSuite() {
  const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "jest-health-")), "report.json");
  const result = spawnSync(
    "pnpm",
    ["exec", "jest", "--no-coverage", "--json", `--outputFile=${out}`],
    { cwd: ROOT, stdio: ["ignore", "inherit", "inherit"], env: { ...process.env } },
  );
  if (!fs.existsSync(out)) {
    // NOTHING FAILS SILENTLY: no report means the battery never ran, which is
    // not the same as "nothing is red" and must never print as zero.
    console.error(
      "\njest-health: jest wrote no JSON report" +
        (result.error ? ` (${result.error.message})` : "") +
        ". The battery did not run, so this is UNMEASURED — not zero red. " +
        "Run `pnpm test` directly to see why.\n",
    );
    process.exit(2);
  }
  return JSON.parse(fs.readFileSync(out, "utf8"));
}

function selfTest() {
  const cases = [
    ["env", "features/x.test.ts UNMEASURED: the aidream checkout is absent"],
    ["flaky", 'thrown: "Exceeded timeout of 5000 ms for a test."'],
    ["harness", "[detail] No DetailHostProvider above this component. Mount the host binding"],
    ["harness", "TypeError: Cannot read properties of undefined (reading 'adminLevel')"],
    [
      "time-bomb",
      'Expected substring: "Duane Upshaw"\nReceived string: "Agenda Refreshed 19 hours ago ... Nothing on your calendar." synced_at 2026-09-18T12:00:00Z',
    ],
    [
      "contract-change",
      "media.source_library carries `last_synced_at` ... Remedy: add the column to that list",
    ],
    ["unclassified", "expect(received).toBe(expected)\n\nExpected: 3\nReceived: 4"],
  ];
  let failures = 0;
  for (const [expected, text] of cases) {
    const got = classify(text);
    const ok = got === expected;
    if (!ok) failures += 1;
    console.log(`  ${ok ? "PASS" : "FAIL"}  ${expected} <- ${JSON.stringify(text.slice(0, 60))}${ok ? "" : ` (got ${got})`}`);
  }
  // The classifier must also be able to come back with NOTHING to say, or
  // "unclassified" would be a bucket that swallows the signal.
  console.log("");
  console.log(failures === 0 ? "jest-health --self-test: PASS" : `jest-health --self-test: ${failures} FAILED`);
  return failures === 0 ? 0 : 1;
}

const argv = process.argv.slice(2);
if (argv.includes("--self-test")) {
  process.exit(selfTest());
}

const jsonAt = argv.indexOf("--json");
const json = jsonAt >= 0 ? JSON.parse(fs.readFileSync(argv[jsonAt + 1], "utf8")) : runSuite();
const red = report(json);

// A SIGNAL, NEVER A GATE (matrx-frontend CLAUDE.md; the CI-never-completes
// ruling). `--strict` exists for a person who asked for a verdict.
process.exit(argv.includes("--strict") && red > 0 ? 1 : 0);
