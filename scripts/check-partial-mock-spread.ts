/**
 * check:partial-mock-spread — A PARTIAL MOCK OF A REAL MODULE IS A SUITE THAT
 * DIES ON THE NEXT EXPORT (DD-239).
 *
 * WHAT THIS GUARDS. `jest.mock("@/lib/diagnostics/errorCaptureStore", () => ({
 * captureError: jest.fn() }))` replaces the WHOLE module with one export. The
 * day the module grows an export that production code calls at import time —
 * exactly what happened when the session barrier began calling
 * `setSessionStateProbe()` at Supabase-client construction — every suite
 * carrying that shape stops being able to import at all. It does not fail: it
 * runs ZERO tests, and the thing it was written to forbid is free.
 *
 * It has now happened twice on the same module: four `features/content-ir`
 * suites on 2026-09-14 (DD-239, which produced `check:test-suites` as a runner
 * net over that one scope), and three `features/agents/redux/execution-system`
 * suites afterwards, outside that scope. `check:test-suites` catches a death
 * after it happens, in two directories. This catches the SHAPE, everywhere,
 * before it can die.
 *
 * THE RULE. A `jest.mock()` of one of the modules below whose factory returns
 * an object literal must spread the real module first:
 *
 *   jest.mock("<module>", () => ({
 *     ...jest.requireActual("<module>"),
 *     captureError: jest.fn(),
 *   }));
 *
 * Only the export the suite observes is replaced; a new export can never take
 * the suite down. A factory that is not an object literal (a class, a function,
 * an explicit `jest.requireActual` call) is not this shape and is not flagged.
 *
 * SCOPE — modules that are (a) first-party, (b) imported transitively by a very
 * large part of the app, and (c) already called at import/construction time by
 * production code. Add a module here the moment a suite dies on it.
 *
 * Usage:
 *   tsx scripts/check-partial-mock-spread.ts
 *   tsx scripts/check-partial-mock-spread.ts --self-test
 */

import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { exitAfterDrain } from "./lib/exit-after-drain";

const REPO = path.resolve(__dirname, "..");

/** The modules a partial mock must never truncate. */
const GUARDED_MODULES = ["@/lib/diagnostics/errorCaptureStore"];

export interface Finding {
  file: string;
  line: number;
  module: string;
}

/**
 * Find every guarded `jest.mock(<module>, () => ({ … }))` whose factory object
 * does not spread the real module.
 *
 * The factory body is read by brace-matching from the `({` that opens it, so a
 * spread anywhere inside the returned literal counts and a spread belonging to
 * a LATER `jest.mock` in the same file never does.
 */
export function findViolations(source: string, file: string): Finding[] {
  const findings: Finding[] = [];
  for (const moduleId of GUARDED_MODULES) {
    const needle = `jest.mock("${moduleId}"`;
    let at = source.indexOf(needle);
    while (at !== -1) {
      const open = source.indexOf("({", at);
      if (open !== -1) {
        // Brace-match from the object literal's `{` to its close.
        let depth = 0;
        let end = open + 1;
        for (let i = open + 1; i < source.length; i += 1) {
          if (source[i] === "{") depth += 1;
          else if (source[i] === "}") {
            depth -= 1;
            if (depth === 0) {
              end = i;
              break;
            }
          }
        }
        const factory = source.slice(open, end + 1);
        const isObjectLiteral = /^\(\{/.test(source.slice(open, open + 2));
        const spreads = factory.includes(
          `...jest.requireActual("${moduleId}")`,
        );
        if (isObjectLiteral && !spreads) {
          findings.push({
            file,
            line: source.slice(0, at).split("\n").length,
            module: moduleId,
          });
        }
      }
      at = source.indexOf(needle, at + needle.length);
    }
  }
  return findings;
}

function trackedTestFiles(): string[] {
  const out = execFileSync(
    "git",
    ["ls-files", "*.test.ts", "*.test.tsx", "*.dev.test.ts", "*.dev.test.tsx"],
    { cwd: REPO, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  );
  return out.split("\n").filter(Boolean);
}

export function sweep(files: string[]): Finding[] {
  const findings: Finding[] = [];
  for (const rel of files) {
    const abs = path.join(REPO, rel);
    let source: string;
    try {
      source = readFileSync(abs, "utf8");
    } catch {
      continue;
    }
    if (!GUARDED_MODULES.some((m) => source.includes(`jest.mock("${m}"`)))
      continue;
    findings.push(...findViolations(source, rel));
  }
  return findings;
}

function report(findings: Finding[]): void {
  for (const f of findings) {
    console.error(
      `FAIL ${f.file}:${f.line} — jest.mock("${f.module}") replaces the whole ` +
        `module. Add \`...jest.requireActual("${f.module}"),\` as the first ` +
        `property of the factory object, so a new export cannot kill this ` +
        `suite at import (DD-239).`,
    );
  }
}

/** Plant the violation in a scratch file, prove it is caught, delete it. */
function selfTest(): void {
  const dir = mkdtempSync(path.join(tmpdir(), "partial-mock-spread-"));
  try {
    const good = path.join(dir, "good.test.ts");
    writeFileSync(
      good,
      `jest.mock("@/lib/diagnostics/errorCaptureStore", () => ({\n` +
        `  ...jest.requireActual("@/lib/diagnostics/errorCaptureStore"),\n` +
        `  captureError: jest.fn(),\n}));\n`,
    );
    const bad = path.join(dir, "bad.test.ts");
    writeFileSync(
      bad,
      `jest.mock("@/lib/diagnostics/errorCaptureStore", () => ({\n` +
        `  captureError: jest.fn(),\n}));\n`,
    );

    const cleanFindings = findViolations(readFileSync(good, "utf8"), "good");
    const plantedFindings = findViolations(readFileSync(bad, "utf8"), "bad");

    if (cleanFindings.length !== 0) {
      console.error(
        "SELF-TEST FAIL: the spread form was reported as a violation.",
      );
      exitAfterDrain(1);
      return;
    }
    if (plantedFindings.length !== 1) {
      console.error(
        `SELF-TEST FAIL: the planted truncating mock was NOT caught ` +
          `(${plantedFindings.length} findings).`,
      );
      exitAfterDrain(1);
      return;
    }
    console.log(
      "SELF-TEST PASS: the truncating mock is caught, the spread form is not.",
    );
    exitAfterDrain(0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function main(): void {
  if (process.argv.includes("--self-test")) {
    selfTest();
    return;
  }
  const findings = sweep(trackedTestFiles());
  if (findings.length > 0) {
    report(findings);
    console.error(`\n${findings.length} truncating mock(s) of a guarded module.`);
    exitAfterDrain(1);
    return;
  }
  console.log(
    `PASS check:partial-mock-spread — every jest.mock of ${GUARDED_MODULES.join(", ")} spreads the real module.`,
  );
  exitAfterDrain(0);
}

main();
