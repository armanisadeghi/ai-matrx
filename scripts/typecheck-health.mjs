#!/usr/bin/env node
/**
 * typecheck-health — how many `tsc --noEmit` errors this checkout carries,
 * BY FILE, in one screen.
 *
 * WHY IT EXISTS. `pnpm type-check` (== `tsc --noEmit -p tsconfig.typecheck.json`)
 * either prints a wall of raw compiler lines or nothing at all. Nobody holds a
 * number across time, so drift between two commits — clean at one SHA, N
 * errors at the next — is invisible until someone happens to run it by hand.
 * A COUNT nobody prints is a count nobody owns (see scripts/jest-health.mjs).
 *
 * WHAT IT PRINTS. Every `tsc` error grouped by the file it points at, with the
 * TS error code and first line of message, so the next drift is legible at a
 * glance instead of a scroll of `file(line,col): error TSxxxx: ...`.
 *
 * IT IS A SIGNAL, NEVER A GATE. It exits 0 whatever it finds (`--strict` flips
 * that for a human running it deliberately, or for a CI step that wants a
 * verdict). CI that goes red on a number nobody triages gets turned off; CI
 * that prints one gets read.
 *
 *   node scripts/typecheck-health.mjs                 # run tsc, print the census
 *   node scripts/typecheck-health.mjs --strict         # same, exit 1 if any errors
 *   node scripts/typecheck-health.mjs --file <path>    # classify an existing tsc log
 *   node scripts/typecheck-health.mjs --self-test       # prove the parser on known shapes
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// A tsc --noEmit error line looks like:
//   features/foo/bar.tsx(12,34): error TS2322: Type 'X' is not assignable to type 'Y'.
const ERROR_LINE = /^(?<file>.*)\((?<line>\d+),(?<col>\d+)\):\s*error\s+(?<code>TS\d+):\s*(?<message>.*)$/;

/** Parse raw `tsc --noEmit` stdout/stderr text into one row per error. */
export function parseErrors(text) {
  const rows = [];
  for (const raw of text.split("\n")) {
    const line = raw.trimEnd();
    const match = ERROR_LINE.exec(line);
    if (!match) continue;
    const { file, line: ln, col, code, message } = match.groups;
    rows.push({
      file: file.trim(),
      line: Number(ln),
      col: Number(col),
      code,
      message: message.trim(),
    });
  }
  return rows;
}

function groupByFile(rows) {
  const byFile = new Map();
  for (const row of rows) {
    if (!byFile.has(row.file)) byFile.set(row.file, []);
    byFile.get(row.file).push(row);
  }
  // Highest error count first so the worst offender leads the screen.
  return [...byFile.entries()].sort((a, b) => b[1].length - a[1].length);
}

function report(rows) {
  const total = rows.length;
  console.log("");
  console.log(`typecheck-health — ${total} error${total === 1 ? "" : "s"} from tsc --noEmit`);
  console.log("");
  if (total === 0) {
    console.log("  Zero errors. tsconfig.typecheck.json compiles clean.");
    console.log("");
    return 0;
  }
  for (const [file, fileRows] of groupByFile(rows)) {
    console.log(`  ${file} (${fileRows.length})`);
    for (const row of fileRows) {
      console.log(`    ${row.line}:${row.col}  ${row.code}  ${row.message.slice(0, 160)}`);
    }
    console.log("");
  }
  return total;
}

function runTypecheck() {
  const result = spawnSync(
    "bash",
    ["scripts/tsc-capped.sh", "tsc6", "--noEmit", "-p", "tsconfig.typecheck.json"],
    { cwd: ROOT, encoding: "utf8" },
  );
  // tsc writes its diagnostics to stdout; a launch failure (missing binary,
  // bad tsconfig path) shows up on stderr or as a non-zero exit with no
  // parseable lines at all — NOTHING FAILS SILENTLY, so that case is not the
  // same as "zero errors" and must say so.
  const text = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
  if (result.error) {
    console.error(`\ntypecheck-health: could not launch tsc (${result.error.message}).\n`);
    process.exit(2);
  }
  const rows = parseErrors(text);
  if (rows.length === 0 && result.status !== 0) {
    console.error(
      "\ntypecheck-health: tsc exited non-zero but produced no parseable error " +
        "lines. The run did not complete, so this is UNMEASURED — not zero " +
        "errors. Run `pnpm type-check` directly to see why.\n",
    );
    console.error(text.trim().slice(0, 2000));
    process.exit(2);
  }
  return rows;
}

function selfTest() {
  const sample = [
    "features/agents/utils/scope-mapping.ts(42,7): error TS2322: Type 'string' is not assignable to type 'SurfaceScope'.",
    "features/agents/utils/scope-mapping.ts(58,3): error TS2345: Argument of type 'undefined' is not assignable to parameter of type 'string'.",
    "lib/api/typed-client.ts(101,12): error TS2551: Property 'foo' does not exist on type 'Client'. Did you mean 'fooBar'?",
    "app/(admin)/administration/agents/system-agents/agents/[id]/v/[version]/page.tsx(36,22): error TS18047: 'agent' is possibly 'null'.",
    "Found 4 errors in 3 files.",
    "",
  ].join("\n");
  const rows = parseErrors(sample);
  let failures = 0;
  const expectCount = 4;
  if (rows.length !== expectCount) {
    failures += 1;
    console.log(`  FAIL  expected ${expectCount} parsed rows, got ${rows.length}`);
  } else {
    console.log(`  PASS  parsed ${rows.length} rows from sample tsc output`);
  }
  if (rows[3]?.file !== "app/(admin)/administration/agents/system-agents/agents/[id]/v/[version]/page.tsx") {
    failures += 1;
    console.log("  FAIL  preserved a diagnostic path containing parentheses");
  } else {
    console.log("  PASS  preserved a diagnostic path containing parentheses");
  }
  const grouped = groupByFile(rows);
  if (grouped[0]?.[0] !== "features/agents/utils/scope-mapping.ts" || grouped[0]?.[1]?.length !== 2) {
    failures += 1;
    console.log("  FAIL  expected scope-mapping.ts to lead with 2 errors");
  } else {
    console.log("  PASS  grouped by file with worst offender first");
  }
  console.log("");
  console.log(failures === 0 ? "typecheck-health --self-test: PASS" : `typecheck-health --self-test: ${failures} FAILED`);
  return failures === 0 ? 0 : 1;
}

const argv = process.argv.slice(2);
if (argv.includes("--self-test")) {
  process.exit(selfTest());
}

const fileAt = argv.indexOf("--file");
const rows = fileAt >= 0 ? parseErrors(fs.readFileSync(argv[fileAt + 1], "utf8")) : runTypecheck();
const count = report(rows);

// A SIGNAL, NEVER A GATE (matrx-frontend CLAUDE.md; the CI-never-completes
// ruling). `--strict` exists for a person who asked for a verdict.
process.exit(argv.includes("--strict") && count > 0 ? 1 : 0);
