/**
 * check:test-suites — NO SUITE DIES SILENTLY (DD-239).
 *
 * WHAT THIS GUARDS. On 2026-09-14 four `features/content-ir` suites — including
 * both DD-215b sandbox suites, 55 tests between them — stopped running
 * entirely. Not failing: DYING AT IMPORT, because each replaced a real module
 * with a partial mock (`jest.mock("@/lib/diagnostics/errorCaptureStore", () =>
 * ({ captureError: jest.fn() }))`) and the module grew an export the code under
 * test then called at construction time. A suite that cannot be imported runs
 * zero tests, so the thing it was written to forbid became free — and the only
 * trace was four lines in a scroll-back nobody re-read. The sandbox rollout was
 * about to be taken platform-wide behind tests that were not running.
 *
 * Seventeen other suites in this repo still mock that same module partially
 * (`git grep -l 'jest.mock("@/lib/diagnostics/errorCaptureStore"'`). They are
 * green today and each is one new export away from the same death, which is
 * exactly why the net belongs here, at the runner, and not in seventeen files.
 *
 * THE RULE, over a declared scope:
 *   1. Every suite in the committed manifest must still be collected AND run.
 *   2. No suite may end with a "Test suite failed to run" (an import/transform
 *      death) — that is reported separately from a failing assertion, by name.
 *   3. A suite that runs ZERO tests is reported too: a file that collects but
 *      executes nothing is the same absence wearing a green coat.
 *
 * Usage:
 *   tsx scripts/check-test-suites.ts
 *   tsx scripts/check-test-suites.ts --update      # re-record the manifest
 *   tsx scripts/check-test-suites.ts --self-test   # prove the rule catches it
 */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const REPO = path.resolve(__dirname, "..");

/**
 * The scope this guard owns: where the kind route, the resolver, the sandbox
 * suites and the block renderer live — the surface the sandbox rollout widens.
 * Five suites in this scope were dead on 2026-09-14, four in the first path and
 * one in the second.
 */
const SCOPE = [
  "features/content-ir",
  "components/mardown-display/chat-markdown/block-registry",
];
const SCOPE_LABEL = SCOPE.join(" + ");
const MANIFEST = path.join(REPO, "scripts/test-suite-manifest.json");

interface Manifest {
  scope: string;
  recordedAt: string;
  suites: string[];
}

/** The shape of `jest --json` this guard reads. Nothing else is touched. */
interface JestSuiteResult {
  name: string;
  status?: string;
  assertionResults?: Array<{ status: string }>;
  message?: string;
  testExecError?: unknown;
}
interface JestRun {
  testResults?: JestSuiteResult[];
  numTotalTests?: number;
}

function relative(file: string): string {
  return path.relative(REPO, file).split(path.sep).join("/");
}

export interface Verdict {
  failedToRun: string[];
  missing: string[];
  empty: string[];
  ran: number;
}

/**
 * THE RULE ITSELF, pure so the self-test can drive it with a recorded run.
 * A suite "failed to run" when jest reports an execution error for it or its
 * message carries jest's own words for an import death.
 */
export function judge(run: JestRun, manifest: Manifest): Verdict {
  const results = run.testResults ?? [];
  const seen = new Set(results.map((suite) => relative(suite.name)));
  const failedToRun: string[] = [];
  const empty: string[] = [];
  for (const suite of results) {
    const file = relative(suite.name);
    const died =
      suite.testExecError !== undefined ||
      /Test suite failed to run/.test(suite.message ?? "");
    if (died) {
      failedToRun.push(file);
      continue;
    }
    if ((suite.assertionResults ?? []).length === 0) empty.push(file);
  }
  const missing = manifest.suites.filter((file) => !seen.has(file));
  return { failedToRun, missing, empty, ran: results.length };
}

function runJest(args: string[]): string {
  return execFileSync("npx", ["jest", ...args], {
    cwd: REPO,
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
    stdio: ["ignore", "pipe", "ignore"],
  });
}

function update(): number {
  const listed = JSON.parse(runJest([...SCOPE, "--listTests", "--json"])) as string[];
  const manifest: Manifest = {
    scope: SCOPE_LABEL,
    recordedAt: new Date().toISOString().slice(0, 10),
    suites: listed.map(relative).sort(),
  };
  writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(
    `check-test-suites: recorded ${manifest.suites.length} suites for ${SCOPE_LABEL}. ` +
      `Commit scripts/test-suite-manifest.json with the change that added or removed them.`,
  );
  return 0;
}

function report(verdict: Verdict): number {
  if (
    verdict.failedToRun.length === 0 &&
    verdict.missing.length === 0 &&
    verdict.empty.length === 0
  ) {
    console.log(
      `check-test-suites: OK — every one of the ${verdict.ran} suites under ${SCOPE_LABEL} was ` +
        `imported, ran, and is still the set the manifest names.`,
    );
    return 0;
  }
  console.error("check-test-suites: a suite is not running, and that is not a pass.\n");
  for (const file of verdict.failedToRun) {
    console.error(
      `  - ${file}: FAILED TO RUN — it died at import, so none of its tests ran. ` +
        `Usually a partial jest.mock of a real module that has since grown an export ` +
        `(spread jest.requireActual into the mock).`,
    );
  }
  for (const file of verdict.missing) {
    console.error(
      `  - ${file}: in the manifest but NOT COLLECTED — renamed, moved, deleted or ` +
        `excluded. If that was deliberate, re-record with --update in the same commit.`,
    );
  }
  for (const file of verdict.empty) {
    console.error(`  - ${file}: collected but ran ZERO tests.`);
  }
  return 1;
}

function run(): number {
  if (!existsSync(MANIFEST)) {
    console.error(
      `check-test-suites: no manifest at ${relative(MANIFEST)}. Run ` +
        `\`pnpm check:test-suites --update\` from a green run and commit it.`,
    );
    return 1;
  }
  const manifest = JSON.parse(readFileSync(MANIFEST, "utf8")) as Manifest;
  let raw: string;
  try {
    raw = runJest([...SCOPE, "--json", "--no-coverage", "--testTimeout=30000"]);
  } catch (error) {
    // jest exits non-zero when tests fail; its JSON is still on stdout, and a
    // failing assertion is not this guard's business — a DEAD suite is.
    raw = (error as { stdout?: string }).stdout ?? "";
    if (!raw) {
      console.error(
        `check-test-suites: jest produced no JSON at all, so the scope is UNMEASURED — ` +
          `that is a failure, never a pass: ${
            error instanceof Error ? error.message : String(error)
          }`,
      );
      return 1;
    }
  }
  const start = raw.indexOf("{");
  const parsed = JSON.parse(raw.slice(start)) as JestRun;
  return report(judge(parsed, manifest));
}

/** A guard nobody has seen fail is not a guard. */
function selfTest(): number {
  const manifest: Manifest = {
    scope: SCOPE_LABEL,
    recordedAt: "2026-09-14",
    suites: [
      "features/content-ir/__tests__/cold-tab-verdict.test.ts",
      "features/content-ir/__tests__/unverified-kind-renders-live.test.ts",
    ],
  };
  const abs = (file: string) => path.join(REPO, file);
  const cases: Array<{ name: string; run: JestRun; mustFail: boolean }> = [
    {
      name: "the DD-239 shape — a suite that died at import",
      mustFail: true,
      run: {
        testResults: [
          {
            name: abs("features/content-ir/__tests__/cold-tab-verdict.test.ts"),
            assertionResults: [],
            message:
              "● Test suite failed to run\n    TypeError: (0 , errorCaptureStore_1.setSessionStateProbe) is not a function",
          },
          {
            name: abs(
              "features/content-ir/__tests__/unverified-kind-renders-live.test.ts",
            ),
            assertionResults: [{ status: "passed" }],
          },
        ],
      },
    },
    {
      name: "a manifest suite that stopped being collected at all",
      mustFail: true,
      run: {
        testResults: [
          {
            name: abs("features/content-ir/__tests__/cold-tab-verdict.test.ts"),
            assertionResults: [{ status: "passed" }],
          },
        ],
      },
    },
    {
      name: "a failing assertion is NOT this guard's business",
      mustFail: false,
      run: {
        testResults: [
          {
            name: abs("features/content-ir/__tests__/cold-tab-verdict.test.ts"),
            assertionResults: [{ status: "failed" }],
          },
          {
            name: abs(
              "features/content-ir/__tests__/unverified-kind-renders-live.test.ts",
            ),
            assertionResults: [{ status: "passed" }],
          },
        ],
      },
    },
  ];
  let failures = 0;
  for (const testCase of cases) {
    const verdict = judge(testCase.run, manifest);
    const flagged =
      verdict.failedToRun.length + verdict.missing.length + verdict.empty.length > 0;
    const ok = flagged === testCase.mustFail;
    console.log(
      `[self-test] ${ok ? "PASS" : "FAIL"} — ${testCase.name}: ${
        flagged ? "flagged" : "clean"
      }`,
    );
    if (!ok) failures += 1;
  }
  if (failures > 0) {
    console.error("[self-test] FAIL — the rule does not hold DD-239 closed.");
    return 1;
  }
  console.log(
    "[self-test] PASS — a dead suite and a vanished suite both fail; a failing assertion does not.",
  );
  return 0;
}

if (require.main === module) {
  process.exit(
    process.argv.includes("--self-test")
      ? selfTest()
      : process.argv.includes("--update")
        ? update()
        : run(),
  );
}
