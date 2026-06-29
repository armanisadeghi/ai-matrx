#!/usr/bin/env tsx
/**
 * Strictness-flag measurement harness — see docs/upgrades/README.md (TS strictness wave).
 *
 * The strictness rollout is empirical: flip the flag that surfaces the FEWEST
 * errors first, fix that small batch with the exact-change context, then move to
 * the next. This script measures each candidate compiler flag IN ISOLATION on top
 * of the current (loose) tsconfig.typecheck.json baseline, so we can rank the
 * flags ascending by error count and decide the path from real data.
 *
 * For each flag it:
 *   1. writes a temp tsconfig (extends ./tsconfig.typecheck.json) with the flag on,
 *   2. runs `tsc --noEmit` against it,
 *   3. counts `error TSxxxx` lines, tallies them by error code,
 *   4. saves the full error list to type-errors/<flag>.txt for the fix agents.
 *
 * Usage:
 *   pnpm measure:strict                 measure every candidate flag (sequential)
 *   pnpm measure:strict -- noImplicitAny strictNullChecks   measure only these
 *   pnpm measure:strict -- --json       also emit type-errors/_summary.json
 *
 * It mutates nothing tracked: the temp tsconfig is written to a gitignored path
 * and removed on exit; type-errors/ is gitignored.
 */

import { execSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// Candidate flags, grouped. `needs` documents flags that only bite when another
// is also on (TS only reports them in combination) — measured anyway, annotated.
const CANDIDATES: { flag: string; group: string; needs?: string }[] = [
  // `strict` family — measured individually
  { flag: "noImplicitAny", group: "strict-family" },
  { flag: "strictNullChecks", group: "strict-family" },
  { flag: "strictFunctionTypes", group: "strict-family" },
  { flag: "strictBindCallApply", group: "strict-family" },
  { flag: "noImplicitThis", group: "strict-family" },
  { flag: "useUnknownInCatchVariables", group: "strict-family" },
  { flag: "alwaysStrict", group: "strict-family" },
  {
    flag: "strictPropertyInitialization",
    group: "strict-family",
    needs: "strictNullChecks",
  },
  // Quality flags — not part of `strict`
  { flag: "noImplicitReturns", group: "quality" },
  { flag: "noFallthroughCasesInSwitch", group: "quality" },
  { flag: "noImplicitOverride", group: "quality" },
  { flag: "noUnusedLocals", group: "quality" },
  { flag: "noUnusedParameters", group: "quality" },
];

const ROOT = process.cwd();
const OUT_DIR = join(ROOT, "type-errors");
const TMP_CONFIG = join(ROOT, ".tsconfig.measure.tmp.json");
const ERROR_RE = /error TS(\d+):/;

interface Result {
  flag: string;
  group: string;
  needs?: string;
  errors: number;
  files: number;
  byCode: Record<string, number>;
}

function parseArgs(): { flags: string[]; json: boolean } {
  const argv = process.argv.slice(2);
  const json = argv.includes("--json");
  const flags = argv.filter((a) => !a.startsWith("--"));
  return { flags, json };
}

function measure(flag: string): {
  raw: string;
  errors: number;
  files: number;
  byCode: Record<string, number>;
} {
  writeFileSync(
    TMP_CONFIG,
    JSON.stringify(
      {
        extends: "./tsconfig.typecheck.json",
        compilerOptions: { incremental: false, [flag]: true },
      },
      null,
      2,
    ),
  );

  let raw = "";
  try {
    raw = execSync(
      `NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit -p ${TMP_CONFIG}`,
      {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        cwd: ROOT,
        maxBuffer: 1024 * 1024 * 128,
      },
    );
  } catch (e: unknown) {
    // tsc exits non-zero when there are errors — that's the expected path.
    const err = e as { stdout?: string; stderr?: string };
    raw = (err.stdout ?? "") + (err.stderr ?? "");
  }

  const byCode: Record<string, number> = {};
  const fileSet = new Set<string>();
  let errors = 0;
  for (const line of raw.split("\n")) {
    const m = ERROR_RE.exec(line);
    if (!m) continue;
    errors++;
    byCode[`TS${m[1]}`] = (byCode[`TS${m[1]}`] ?? 0) + 1;
    const fileMatch = /^(\S+?)\(\d+,\d+\)/.exec(line);
    if (fileMatch) fileSet.add(fileMatch[1]);
  }
  return { raw, errors, files: fileSet.size, byCode };
}

function topCodes(byCode: Record<string, number>, n = 4): string {
  return Object.entries(byCode)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([code, count]) => `${code}:${count}`)
    .join(" ");
}

function main(): void {
  const { flags, json } = parseArgs();
  const targets = flags.length
    ? CANDIDATES.filter((c) => flags.includes(c.flag))
    : CANDIDATES;

  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });

  const results: Result[] = [];
  let i = 0;
  for (const c of targets) {
    i++;
    process.stderr.write(
      `[${i}/${targets.length}] measuring ${c.flag}${c.needs ? ` (needs ${c.needs})` : ""}… `,
    );
    const { raw, errors, files, byCode } = measure(c.flag);
    writeFileSync(join(OUT_DIR, `${c.flag}.txt`), raw);
    results.push({
      flag: c.flag,
      group: c.group,
      needs: c.needs,
      errors,
      files,
      byCode,
    });
    process.stderr.write(`${errors} errors across ${files} files\n`);
  }

  if (existsSync(TMP_CONFIG)) rmSync(TMP_CONFIG);

  results.sort((a, b) => a.errors - b.errors);

  console.log("\n=== Strictness flags ranked by error count (ascending) ===\n");
  console.log(
    "rank  errors  files  flag                              top error codes",
  );
  console.log(
    "----  ------  -----  --------------------------------  ----------------------------",
  );
  results.forEach((r, idx) => {
    const note = r.needs ? ` (needs ${r.needs})` : "";
    console.log(
      `${String(idx + 1).padStart(4)}  ${String(r.errors).padStart(6)}  ${String(r.files).padStart(5)}  ${(r.flag + note).padEnd(32)}  ${topCodes(r.byCode)}`,
    );
  });
  console.log(`\nFull per-flag error lists saved to: type-errors/<flag>.txt`);

  if (json) {
    writeFileSync(
      join(OUT_DIR, "_summary.json"),
      JSON.stringify(results, null, 2),
    );
    console.log(`Summary JSON: type-errors/_summary.json`);
  }
}

main();
