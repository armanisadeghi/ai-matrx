#!/usr/bin/env npx tsx
/**
 * check:error-message-fallback — a hand-rolled "instanceof Error ? … : fallback"
 * hides the real reason behind a generic string.
 *
 * THE BUG (2026-09-27): Redux thunks rejected via `.unwrap()` reject with a
 * plain serialized object `{ message }` (RTK `SerializedError`), never an
 * `Error` instance. Every `err instanceof Error ? err.message : "Unknown
 * error"` (and its variants — `error instanceof Error ? error.message :
 * "<anything>"`) therefore prints the generic fallback for exactly the
 * rejections that carry the useful text. A real case: the agent-builder
 * prompt optimizer showed "Failed to optimize — Unknown error" while the
 * server had actually sent "Request rejected: …".
 *
 * THE FIX, everywhere: `extractErrorMessage(err)` from `@/utils/errors` (a
 * thin re-export of `@ai-matrx/data/net`'s `extractErrorMessage`), which
 * already reads the `.message` of an `Error`, a `{ message: string }` object,
 * a plain string, and several nested/PostgREST shapes — call it once instead
 * of hand-rolling the type check.
 *
 * WHAT THIS FLAGS, per file (comments excluded): an `instanceof Error`
 * ternary whose consequent reads `.message` off the tested identifier and
 * whose alternate is a string literal.
 *
 * THE BASELINE IS A RATCHET, same shape as check-reserved-icons.ts: ~800
 * pre-existing files hand-rolled this before the pattern was named a defect
 * (2026-09-27) — sweeping all of them is its own campaign (tracked
 * separately), not a blocking gate on every unrelated PR. A file not in the
 * baseline, or a count above its baseline, is a NEW instance of the pattern
 * and fails. `--write` ratchets the baseline DOWN to what is still present
 * (never up); with no baseline file it seeds one.
 *
 *   pnpm check:error-message-fallback
 *   pnpm check:error-message-fallback --json
 *   pnpm check:error-message-fallback --write       # ratchet down / seed
 *   pnpm check:error-message-fallback --self-test   # every rule fires on a planted line
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { exitAfterDrain } from "./lib/exit-after-drain";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const BASELINE_FILE = join(ROOT, "scripts", "error-message-fallback-baseline.json");

/** This guard and its baseline talk ABOUT the pattern; they never fire on themselves. */
const SKIP = new Set(["scripts/check-error-message-fallback.ts"]);

// `<ident> instanceof Error ? <same ident>.message : "<string>"` (any quote
// style, any whitespace/newlines between the pieces — several call sites wrap
// this across lines for a toast `description:`).
const PATTERN_RE =
  /\b([A-Za-z_$][\w$]*)\s+instanceof\s+Error\s*\?\s*\1\s*\.\s*message\s*:\s*(?:"[^"]*"|'[^']*'|`[^`]*`)/g;

function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");
}

/** How many hand-rolled `instanceof Error` fallback ternaries a file's source holds. Pure. */
export function countFallbackTernaries(source: string): number {
  const code = stripComments(source);
  return code.match(PATTERN_RE)?.length ?? 0;
}

type Counts = Record<string, number>;

function scanTree(): Counts {
  const listed = execFileSync(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard", "--", "*.ts", "*.tsx"],
    { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  )
    .split("\n")
    .filter(Boolean);
  const counts: Counts = {};
  for (const file of listed) {
    if (SKIP.has(file) || file.includes("node_modules/") || file.startsWith(".next/")) continue;
    const abs = join(ROOT, file);
    if (!existsSync(abs)) continue;
    const n = countFallbackTernaries(readFileSync(abs, "utf8"));
    if (n > 0) counts[file] = n;
  }
  return counts;
}

export interface Verdict {
  newSites: { file: string; count: number; baseline: number }[];
  cleared: string[];
}

/** New = a file above its baseline count (absent = 0). Pure. */
export function judge(current: Counts, baseline: Counts): Verdict {
  const newSites = Object.entries(current)
    .filter(([file, count]) => count > (baseline[file] ?? 0))
    .map(([file, count]) => ({ file, count, baseline: baseline[file] ?? 0 }))
    .sort((a, b) => a.file.localeCompare(b.file));
  const cleared = Object.keys(baseline)
    .filter((file) => (current[file] ?? 0) < baseline[file])
    .sort();
  return { newSites, cleared };
}

function readBaseline(): Counts | null {
  if (!existsSync(BASELINE_FILE)) return null;
  return JSON.parse(readFileSync(BASELINE_FILE, "utf8")) as Counts;
}

function writeBaseline(counts: Counts): void {
  const sorted = Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(BASELINE_FILE, `${JSON.stringify(sorted, null, 2)}\n`);
}

function selfTest(): number {
  const cases: { name: string; source: string; want: number }[] = [
    {
      name: "single-line, double-quoted fallback",
      source: `err instanceof Error ? err.message : "Unknown error"`,
      want: 1,
    },
    {
      name: "different identifier name",
      source: `const m = error instanceof Error ? error.message : "Failed to connect";`,
      want: 1,
    },
    {
      name: "multi-line (wrapped for a toast description)",
      source: `description:\n  error instanceof Error ? error.message : "Unknown error",`,
      want: 1,
    },
    {
      name: "single-quoted fallback",
      source: `err instanceof Error ? err.message : 'Failed'`,
      want: 1,
    },
    {
      name: "template-literal fallback",
      source: "err instanceof Error ? err.message : `Failed`",
      want: 1,
    },
    {
      name: "two occurrences in one file",
      source: `a(err instanceof Error ? err.message : "x");\nb(err2 instanceof Error ? err2.message : "y");`,
      want: 2,
    },
    {
      name: "extractErrorMessage call — the fix",
      source: `description: extractErrorMessage(err),`,
      want: 0,
    },
    {
      name: "mismatched identifiers — not the pattern (reads a different var's .message)",
      source: `err instanceof Error ? other.message : "Unknown error"`,
      want: 0,
    },
    {
      name: "line comment",
      source: `// err instanceof Error ? err.message : "Unknown error"`,
      want: 0,
    },
    {
      name: "block comment",
      source: `/* err instanceof Error ? err.message : "Unknown error" */`,
      want: 0,
    },
  ];
  let failed = 0;
  for (const c of cases) {
    const got = countFallbackTernaries(c.source);
    const ok = got === c.want;
    if (!ok) failed++;
    console.log(`${ok ? "PASS" : "FAIL"}  ${c.name}: got ${got}, want ${c.want}`);
  }
  const ratchet = judge({ "a.tsx": 2, "b.tsx": 1, "c.tsx": 1 }, { "a.tsx": 2, "b.tsx": 2 });
  const ratchetOk =
    ratchet.newSites.length === 1 &&
    ratchet.newSites[0].file === "c.tsx" &&
    ratchet.cleared.join() === "b.tsx";
  if (!ratchetOk) failed++;
  console.log(`${ratchetOk ? "PASS" : "FAIL"}  ratchet: a new file fails, a lower count is cleared`);
  const grew = judge({ "a.tsx": 3 }, { "a.tsx": 2 });
  const grewOk = grew.newSites.length === 1;
  if (!grewOk) failed++;
  console.log(`${grewOk ? "PASS" : "FAIL"}  ratchet: a count above baseline fails`);
  console.log(failed === 0 ? "self-test: all rules fire" : `self-test: ${failed} failed`);
  return failed === 0 ? 0 : 1;
}

function main(): number {
  const args = new Set(process.argv.slice(2));
  if (args.has("--self-test")) return selfTest();

  const current = scanTree();
  const baseline = readBaseline();
  if (args.has("--write")) {
    if (!baseline) {
      writeBaseline(current);
      console.log(`Seeded ${BASELINE_FILE} with ${Object.keys(current).length} files.`);
      return 0;
    }
    const ratcheted: Counts = {};
    for (const [file, count] of Object.entries(baseline)) {
      const now = Math.min(count, current[file] ?? 0);
      if (now > 0) ratcheted[file] = now;
    }
    writeBaseline(ratcheted);
    console.log(`Ratcheted baseline to ${Object.keys(ratcheted).length} files.`);
    return 0;
  }

  const verdict = judge(current, baseline ?? {});
  if (args.has("--json")) {
    console.log(JSON.stringify({ current, ...verdict }, null, 2));
    return verdict.newSites.length > 0 ? 1 : 0;
  }
  const remaining = Object.keys(current).length;
  if (verdict.newSites.length > 0) {
    console.log(
      `FAIL: a hand-rolled "instanceof Error ? x.message : \\"fallback\\"" hides an RTK SerializedError's real message. Use extractErrorMessage(err) from "@/utils/errors" instead.`,
    );
    for (const site of verdict.newSites) {
      console.log(`  NEW  ${site.file}  (${site.count} use${site.count === 1 ? "" : "s"}, baseline ${site.baseline})`);
    }
    return 1;
  }
  console.log(
    `OK: no new hand-rolled instanceof-Error fallback. ${remaining} baseline file${remaining === 1 ? "" : "s"} still to clear.` +
      (verdict.cleared.length > 0
        ? ` ${verdict.cleared.length} cleared since the baseline — run --write to ratchet it down.`
        : ""),
  );
  return 0;
}

exitAfterDrain(main());
