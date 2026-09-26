#!/usr/bin/env npx tsx
/**
 * ONE MARKDOWN-TABLE WRITER — guard.
 *
 * Every path that writes a markdown table row goes through
 * components/rich-editor/core/table-source.ts (rewriteTableSource / freshRow).
 * Three answer-table editors each had a private writer that re-padded every
 * row, widened the delimiter row and split an escaped `\|` into two cells, so
 * editing one cell rewrote the whole table and could delete text
 * (verify-RC-B4 R3-1).
 *
 * This finds code that builds a markdown table row by hand — `"| " + cells.join(" | ")`,
 * `cells.join(" | ") + " |"`, a template `| ${cells.join(" | ")} |`, or a
 * `padEnd(...)` row — outside the writer. Existing sites are a SHRINK-ONLY
 * baseline (scripts/table-writers-baseline.json): a new site fails, and so
 * does a baseline entry that no longer exists (prune it with --prune-baseline).
 *
 *   pnpm check:table-writers             guard
 *   pnpm check:table-writers:self-test   proves the scanner finds each shape
 *   … --prune-baseline                   drop stale entries (never add by hand)
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "..");
const BASELINE = path.join(__dirname, "table-writers-baseline.json");
const WRITER_HOME = new Set(["components/rich-editor/core/table-source.ts"]);

const JOIN_PIPE = String.raw`\.join\(\s*["'\x60]\s?\|\s?["'\x60]\s*\)`;
const SHAPES: Array<{ name: string; re: RegExp }> = [
  { name: `"| " + cells.join(" | ")`, re: new RegExp(String.raw`["'\x60]\|\s?["'\x60]\s*\+[^\n;]*?` + JOIN_PIPE) },
  { name: `cells.join(" | ") + " |"`, re: new RegExp(JOIN_PIPE + String.raw`\s*\+\s*["'\x60]\s?\|`) },
  { name: "template | ${cells.join(\" | \")} |", re: new RegExp(String.raw`\x60[^\x60\n]*\|\s?\$\{[^}\n]*` + JOIN_PIPE + String.raw`[^}\n]*\}\s?\|`) },
  { name: "padEnd(...) table row", re: new RegExp(String.raw`padEnd\([^\n]*` + JOIN_PIPE) },
];

export function findTableWriters(source: string): Array<{ line: number; shape: string }> {
  const hits: Array<{ line: number; shape: string }> = [];
  source.split("\n").forEach((text, index) => {
    for (const shape of SHAPES) {
      if (shape.re.test(text)) {
        hits.push({ line: index + 1, shape: shape.name });
        break;
      }
    }
  });
  return hits;
}

function trackedSources(): string[] {
  return execFileSync("git", ["ls-files", "--", "*.ts", "*.tsx"], { cwd: ROOT, encoding: "utf8" })
    .split("\n")
    .filter((file) => file && !/(^|\/)__tests__\/|\.test\.tsx?$|\.spec\.tsx?$/.test(file) && !file.startsWith("scripts/check-table-writers"));
}

/** file → number of hand-built table-row sites. */
function census(): Map<string, number> {
  const out = new Map<string, number>();
  for (const file of trackedSources()) {
    if (WRITER_HOME.has(file)) continue;
    let source: string;
    try {
      source = readFileSync(path.join(ROOT, file), "utf8");
    } catch {
      continue;
    }
    const hits = findTableWriters(source);
    if (hits.length) out.set(file, hits.length);
  }
  return out;
}

function selfTest(): number {
  const planted = [
    'const row = "| " + cells.join(" | ") + " |";',
    "const row = cells.join(' | ') + ' |';",
    "const row = `| ${cells.map(esc).join(\" | \")} |`;",
    "row.map((cell, i) => cell.padEnd(maxLengths[i])).join(\" | \") +",
  ];
  const clean = ['const key = columns.map((c) => c.id).join("|");', 'throw new Error(`one of: ${KEYS.join(" | ")}.`);'];
  const missed = planted.filter((line) => findTableWriters(line).length === 0);
  const falsePositives = clean.filter((line) => findTableWriters(line).length > 0);
  if (missed.length || falsePositives.length) {
    console.error(`self-test FAILED — missed: ${JSON.stringify(missed)}; false positives: ${JSON.stringify(falsePositives)}`);
    return 1;
  }
  console.log(`self-test ok — ${planted.length} planted shapes found, ${clean.length} look-alikes ignored`);
  return 0;
}

function main(): number {
  const args = process.argv.slice(2);
  if (args.includes("--self-test")) return selfTest();
  const now = census();
  let baseline: Record<string, number> = {};
  try {
    baseline = (JSON.parse(readFileSync(BASELINE, "utf8")) as { sites: Record<string, number> }).sites;
  } catch {
    baseline = {};
  }
  if (args.includes("--prune-baseline") || args.includes("--write-baseline")) {
    const next: Record<string, number> = {};
    for (const [file, count] of now) {
      const allowed = args.includes("--write-baseline") ? count : Math.min(count, baseline[file] ?? 0);
      if (allowed > 0) next[file] = allowed;
    }
    writeFileSync(
      BASELINE,
      `${JSON.stringify(
        {
          about:
            "Shrink-only baseline for `pnpm check:table-writers`: files that build a markdown table row by hand instead of through components/rich-editor/core/table-source.ts. Prune with --prune-baseline; never add entries by hand.",
          sites: Object.fromEntries(Object.entries(next).sort()),
        },
        null,
        2,
      )}\n`,
    );
    console.log(`baseline written: ${Object.keys(next).length} files`);
    return 0;
  }
  const errors: string[] = [];
  for (const [file, count] of now) {
    const allowed = baseline[file] ?? 0;
    if (count > allowed) {
      const lines = findTableWriters(readFileSync(path.join(ROOT, file), "utf8")).map((hit) => `${file}:${hit.line} (${hit.shape})`);
      errors.push(`NEW hand-built markdown table row in ${file} (${count} > baseline ${allowed}):\n    ${lines.join("\n    ")}`);
    }
  }
  for (const [file, allowed] of Object.entries(baseline)) {
    if ((now.get(file) ?? 0) < allowed) errors.push(`STALE baseline entry ${file} (${allowed} → ${now.get(file) ?? 0}) — run --prune-baseline`);
  }
  if (errors.length) {
    console.error(errors.join("\n"));
    console.error(
      "\nWrite markdown tables through components/rich-editor/core/table-source.ts: rewriteTableSource(original, grid) " +
        "to edit a stored table (only edited cells change), freshRow(cells) for a row the table never stored.",
    );
    return 1;
  }
  console.log(`table writers: ${now.size} baseline files, no new hand-built table rows`);
  return 0;
}

process.exit(main());
