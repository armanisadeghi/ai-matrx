#!/usr/bin/env npx tsx
/**
 * check:static-loader — Loader2 is a spinner arc, never a resting icon.
 *
 * At rest the lucide `loader-2` path is an incomplete circle. Using it as a
 * refresh / action glyph (and only adding `animate-spin` while busy) is the
 * 2026-09-12 table-toolbar defect: every MatrxDataTable refresh button read
 * as a broken half-circle. The package now owns RefreshControlIcon; this
 * check keeps the same class out of host UI.
 *
 * WHAT THIS FLAGS: a `<Loader2` / `<Loader2Icon` opening tag whose className
 * does not unconditionally include `animate-spin`, `matrx-spin`, or
 * `MOTION_SPIN`, or that puts `animate-spin` behind `&&`.
 *
 * Exit 1 on any finding. `--self-test` proves the check can fail.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const SELF_TEST = process.argv.includes("--self-test");
const SCAN_DIRS = ["features", "components", "app"];
const SPINNER = /<(Loader2|Loader2Icon)\b/g;
const SPIN_CLASS = /animate-spin|matrx-spin|MOTION_SPIN/;
const CONDITIONAL_SPIN = /&&\s*["'`]animate-spin["'`]/;

export function restingSpinnerTags(source: string): string[] {
  const offenders: string[] = [];
  for (const match of source.matchAll(new RegExp(SPINNER.source, "g"))) {
    const start = source.indexOf("<", match.index ?? 0);
    const end = source.indexOf(">", start);
    if (start < 0 || end < 0) continue;
    const tag = source.slice(start, end + 1);
    if (!SPIN_CLASS.test(tag) || CONDITIONAL_SPIN.test(tag)) {
      offenders.push(tag.replace(/\s+/g, " "));
    }
  }
  return offenders;
}

function walk(dir: string, out: string[] = []): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    if (name === "node_modules" || name === ".next" || name === ".next-preview") continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx$/.test(name) && !name.endsWith(".test.tsx")) out.push(full);
  }
  return out;
}

function selfTest(): void {
  const leak = restingSpinnerTags(
    `<Loader2 className={cn("h-4 w-4", busy && "animate-spin")} />`,
  );
  const spinning = restingSpinnerTags(`<Loader2 className="h-4 w-4 animate-spin" />`);
  const swapped = restingSpinnerTags(
    `<Loader2 className={[className, "animate-spin"].filter(Boolean).join(" ")} />`,
  );
  const ok = leak.length > 0 && spinning.length === 0 && swapped.length === 0;
  if (!ok) {
    console.error(
      "check:static-loader self-test FAILED — the check no longer distinguishes a resting spinner from a spinning one.",
    );
    process.exit(1);
  }
  console.log(
    "check:static-loader self-test PASSED — the check can fail on a planted resting Loader2 and stays quiet on spinning uses.",
  );
}

function main(): void {
  if (SELF_TEST) {
    selfTest();
    return;
  }
  const files = SCAN_DIRS.flatMap((dir) => walk(join(ROOT, dir)));
  const findings: { file: string; tag: string }[] = [];
  for (const full of files) {
    const source = readFileSync(full, "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    for (const tag of restingSpinnerTags(source)) {
      findings.push({ file: relative(ROOT, full), tag });
    }
  }
  if (findings.length === 0) {
    console.log("check:static-loader — no resting Loader2 glyphs.");
    return;
  }
  console.error(`check:static-loader — ${findings.length} resting spinner(s):\n`);
  for (const finding of findings) {
    console.error(`  ${finding.file}\n    ${finding.tag}\n`);
  }
  console.error(
    "Use RefreshCw / RefreshControlIcon at rest. Loader2 is an incomplete arc and may only render while it actually spins.",
  );
  process.exit(1);
}

main();
