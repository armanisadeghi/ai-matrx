#!/usr/bin/env npx tsx
/**
 * check:unbounded-reads — find list reads that are TREATED AS COMPLETE but are not.
 *
 * PostgREST caps every response at `db-max-rows` (1000 on Matrx Main) and says
 * so only in a `Content-Range` header. A plain `.select()` therefore returns a
 * successful-looking short list, and any code that turns that list into an
 * EXISTENCE / DIFF / COMPLETENESS verdict starts answering confidently wrong
 * the moment its table crosses 1000 rows. FOUND_DEFECTS D190.
 *
 * The fix is `lib/supabase/readAllRows.ts`, which pages to a verified total and
 * throws rather than returning a partial list.
 *
 * WHAT THIS FLAGS (deliberately narrow, to stay worth reading):
 *   an unbounded `.from(...).select(...)` / `.rpc(...)` — no `.limit()`,
 *   `.range()`, `.single()`, `.maybeSingle()`, `head: true` —
 *   whose result variable is later consumed by an existence/diff operator
 *   (`new Set(`, `.find(`, `.some(`, `.every(`, `.includes(`, `.has(`,
 *   `.length ===` / `!==` / `<` / `>`) within the same function-ish window.
 *
 * WHAT IT DOES NOT FLAG: a read that only renders. That is not this bug.
 *
 * Loud, ADVISORY, never blocking (exit 0 always, per the repo's scream-never-
 * block rule). A finding is a question — "is this list allowed to be short?" —
 * not an automatic defect.
 *
 * KNOWN LIMITS — a clean run is a floor, NOT a proof. This is a line-window
 * text scan, tuned for precision over recall so the output stays worth reading:
 *   - raw `fetch(.../rest/v1/...)` reads are invisible to it (that is exactly
 *     how the original D190 bug in scripts/check-migrations.ts was written);
 *   - reads destructured out of `Promise.all([...])` are skipped — no single
 *     variable to follow;
 *   - a list read in one function and judged in another is not tracked;
 *   - it stops looking `WINDOW` lines after the read.
 * When you write an existence check, reach for readAllRows because the rule
 * says so, not because this script noticed.
 *
 *   pnpm check:unbounded-reads
 *   pnpm check:unbounded-reads --json
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SCAN_DIRS = ["scripts", "lib", "features", "app", "utils"];
const SKIP_DIR =
  /(^|\/)(node_modules|\.next[^/]*|dist|build|coverage|__tests__|\.git)(\/|$)/;
const C = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  white: "\x1b[97m",
};

/** Chain terminators that prove the caller bounded or single-rowed the read. */
const BOUNDED = [
  ".limit(",
  ".range(",
  ".single(",
  ".maybeSingle(",
  "head: true",
  "readAllRows",
  "readAllRowsRest",
];

/** Consumers that turn a list into a verdict about the whole set. */
const EXISTENCE_OPS = [
  "new Set(",
  ".find(",
  ".some(",
  ".every(",
  ".includes(",
  ".has(",
  ".findIndex(",
];
const LENGTH_CMP = /\.length\s*(===|!==|==|!=|<|>|>=|<=)/;

/** How far past the read we look for a completeness consumer. */
const WINDOW = 60;

interface Finding {
  file: string;
  line: number;
  target: string;
  variable: string;
  consumer: string;
  consumerLine: number;
}

function walk(dir: string, out: string[]): void {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const e of entries) {
    const p = join(dir, e);
    if (SKIP_DIR.test(p)) continue;
    let st;
    try {
      st = statSync(p);
    } catch {
      continue;
    }
    if (st.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx|mts)$/.test(p)) out.push(p);
  }
}

/**
 * The variable a read lands in. Handles the three shapes we actually write:
 *   const rows = await sb...            -> rows
 *   const { data: rows } = await sb...  -> rows
 *   const { data } = await sb...        -> data
 * Returns null for anything else (inline reads, Promise.all destructuring) —
 * we would rather miss a hit than print a guess.
 */
function assignedVariable(stmt: string): string | null {
  const destructured = stmt.match(
    /(?:const|let)\s*\{\s*data\s*:\s*([A-Za-z_$][\w$]*)/,
  );
  if (destructured) return destructured[1] ?? null;
  if (/(?:const|let)\s*\{\s*data\s*[,}]/.test(stmt)) return "data";
  const plain = stmt.match(/(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=/);
  return plain ? (plain[1] ?? null) : null;
}

function scanFile(abs: string): Finding[] {
  const src = readFileSync(abs, "utf8");
  if (!src.includes(".from(") && !src.includes(".rpc(")) return [];
  const lines = src.split("\n");
  const findings: Finding[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    const m =
      line.match(/\.from\(\s*["'`]([^"'`]+)["'`]/) ??
      line.match(/\.rpc\(\s*["'`]([^"'`]+)["'`]/);
    if (!m) continue;

    // Collect the statement: from the line that opens the assignment through
    // the first line ending the chain (`;`).
    let start = i;
    while (
      start > 0 &&
      !/(?:const|let|var|return|await|=)\s*$/.test(lines[start - 1] ?? "") &&
      !/(?:const|let|var)\s/.test(lines[start] ?? "")
    ) {
      const prev = lines[start - 1] ?? "";
      if (/(?:const|let|var)\s.*=\s*$/.test(prev) || /=\s*await\s*$/.test(prev))
        start -= 1;
      else break;
    }
    let end = i;
    while (end < lines.length && !(lines[end] ?? "").includes(";")) end++;
    const stmt = lines.slice(start, Math.min(end + 1, lines.length)).join("\n");

    if (!stmt.includes(".select(") && !stmt.includes(".rpc(")) continue;
    if (BOUNDED.some((b) => stmt.includes(b))) continue;

    const variable = assignedVariable(stmt);
    if (!variable) continue;

    // Look for a completeness consumer of that variable.
    const from = end + 1;
    const to = Math.min(lines.length, end + 1 + WINDOW);
    const use = new RegExp(`\\b${variable.replace(/\$/g, "\\$")}\\b`);
    for (let j = from; j < to; j++) {
      const l = lines[j] ?? "";
      if (!use.test(l)) continue;
      const op =
        EXISTENCE_OPS.find((o) => l.includes(o)) ??
        (LENGTH_CMP.test(l) ? ".length comparison" : null);
      if (!op) continue;
      findings.push({
        file: relative(ROOT, abs),
        line: i + 1,
        target: m[1] ?? "?",
        variable,
        consumer: op,
        consumerLine: j + 1,
      });
      break;
    }
  }
  return findings;
}

function main(): number {
  const files: string[] = [];
  for (const d of SCAN_DIRS) walk(resolve(ROOT, d), files);
  const findings = files.flatMap(scanFile);

  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(findings, null, 2));
    return 0;
  }
  if (findings.length === 0) {
    console.log(
      `${C.cyan}[INFO]${C.reset} Unbounded reads: none feeding an existence/diff decision.`,
    );
    return 0;
  }

  const byFile = new Map<string, Finding[]>();
  for (const f of findings)
    byFile.set(f.file, [...(byFile.get(f.file) ?? []), f]);

  console.log();
  console.log(
    `${C.yellow}[WARN]${C.reset} ${C.bold}${findings.length}${C.reset} unbounded read(s) whose result is used as a COMPLETE list. ` +
      `${C.dim}(advisory, non-blocking)${C.reset}`,
  );
  console.log(
    `  ${C.dim}PostgREST silently caps a plain .select() at 1000 rows. If the list decides ` +
      `whether something EXISTS, a short read is a wrong answer, not a short page.${C.reset}`,
  );
  for (const [file, hits] of [...byFile].sort((a, b) =>
    a[0].localeCompare(b[0]),
  )) {
    console.log(`\n  ${C.white}${file}${C.reset}`);
    for (const h of hits) {
      console.log(
        `    ${C.dim}:${h.line}${C.reset} ${C.cyan}${h.target}${C.reset} → ` +
          `${C.white}${h.variable}${C.reset} used with ${C.yellow}${h.consumer}${C.reset} ${C.dim}at :${h.consumerLine}${C.reset}`,
      );
    }
  }
  console.log(
    `\n  ${C.white}Fix — read it through lib/supabase/readAllRows.ts:${C.reset}\n` +
      `    ${C.dim}const rows = await readAllRows(({from,to}) => sb.from("t")` +
      `.select("*", { count: "exact" }).order("id").range(from,to), { label: "t" });${C.reset}\n` +
      `  ${C.dim}Not a defect if a short list is an acceptable answer here (rendering, preview, sampling).${C.reset}`,
  );
  console.log();
  return 0; // ALWAYS advisory — scream, never block.
}

process.exit(main());
