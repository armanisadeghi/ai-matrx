#!/usr/bin/env npx tsx
/**
 * ONE MARKDOWN-TABLE READER — guard (the twin of check-table-writers).
 *
 * Every path that READS a markdown table goes through THE GFM rule:
 * components/mardown-display/markdown-classification/processors/utils/gfm-table-lines.ts
 * (`opensTable` / `findTableStart` / `findTableEnd` / `continuesTable` /
 * `isGfmDelimiterRow` / `rowCells`) and the one cell-pipe rule
 * (components/markdown-core/syntax/gfm-cell-pipes.ts). Private readers split
 * `\|` into two cells, missed tables written without edge pipes and disagreed
 * with each other about what a delimiter row is (verify-RC-B4 R5-2 / R5-3).
 *
 * This finds a private table reader:
 *   - a row split on a pipe — `.split("|")`, `.split('|')`, `.split(/\|/)` —
 *     within a few lines of the words table / delimiter / separator;
 *   - table detection by a leading pipe — `startsWith("|")`, a regex `/^\s*\|`;
 *   - a private delimiter-row regex — a character class holding both `|` and `-`,
 *     or `:?-` in a regex.
 * Existing sites are a SHRINK-ONLY baseline (scripts/table-readers-baseline.json):
 * a new site fails, and so does a baseline entry that no longer exists.
 *
 *   pnpm check:table-readers             guard
 *   pnpm check:table-readers:self-test   proves the scanner finds each shape
 *   … --prune-baseline                   drop stale entries (never add by hand)
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "..");
const BASELINE = path.join(__dirname, "table-readers-baseline.json");
const READER_HOMES = new Set([
  "components/rich-editor/core/table-source.ts",
  "components/mardown-display/markdown-classification/processors/utils/gfm-table-lines.ts",
  "components/markdown-core/syntax/gfm-cell-pipes.ts",
  "scripts/lib/gfm-table-oracle.ts",
]);

const PIPE_SPLIT = /\.split\(\s*(?:["'`]\|["'`]|\/\\\|\/)\s*\)/;
const TABLE_WORDS = /\b(?:tables?|delimiters?|separators?)\b/i;
const LEAD_PIPE = /startsWith\(\s*["'`]\|["'`]\s*\)|\/\^\\s\*\\\||\/\^\\\|/;
// A character class holding `|`, `-` and `:` (a delimiter row's alphabet), or `:?-` in a regex.
const DELIMITER_REGEX = /\/[^/\n]*(?:\[(?=[^\]\n]*\|)(?=[^\]\n]*-)(?=[^\]\n]*:)[^\]\n]*\]|:\?-)[^/\n]*\//;

export function findTableReaders(source: string): Array<{ line: number; shape: string }> {
  const lines = source.split("\n");
  const hits: Array<{ line: number; shape: string }> = [];
  lines.forEach((text, index) => {
    if (PIPE_SPLIT.test(text)) {
      const near = lines.slice(Math.max(0, index - 4), index + 5).join("\n");
      if (TABLE_WORDS.test(near)) {
        hits.push({ line: index + 1, shape: "row split on a pipe" });
        return;
      }
    }
    if (LEAD_PIPE.test(text)) {
      const near = lines.slice(Math.max(0, index - 4), index + 5).join("\n");
      if (/startsWith/.test(text) || TABLE_WORDS.test(near)) {
        hits.push({ line: index + 1, shape: "table detected by a leading pipe" });
        return;
      }
    }
    if (DELIMITER_REGEX.test(text)) hits.push({ line: index + 1, shape: "private delimiter-row regex" });
  });
  return hits;
}

function trackedSources(): string[] {
  return execFileSync("git", ["ls-files", "--", "*.ts", "*.tsx"], { cwd: ROOT, encoding: "utf8" })
    .split("\n")
    .filter((file) => file && !/(^|\/)__tests__\/|\.test\.tsx?$|\.spec\.tsx?$/.test(file) && !file.startsWith("scripts/check-table-readers"));
}

function census(): Map<string, number> {
  const out = new Map<string, number>();
  for (const file of trackedSources()) {
    if (READER_HOMES.has(file)) continue;
    let source: string;
    try {
      source = readFileSync(path.join(ROOT, file), "utf8");
    } catch {
      continue;
    }
    const hits = findTableReaders(source);
    if (hits.length) out.set(file, hits.length);
  }
  return out;
}

function selfTest(): number {
  const planted = [
    '// each table row\nconst cells = line.split("|").map((c) => c.trim());',
    "const cells = row.split('|'); // the table header",
    'if (trimmed.startsWith("|")) collect();',
    "const SEPARATOR = /^\\|?\\s*:?-{3,}:?\\s*\\|?$/;",
    "if (/^\\|[:\\s|\\-]+\\|?$/.test(line)) skip();",
    "const TABLE_ROW = /^\\s*\\|/; // a table row",
  ];
  const clean = [
    'const [branch, sha] = line.split("|"); // git log --format',
    'const keys = signature ? signature.split("|") : [];',
    "const DATE = /^\\d{4}-\\d{2}-\\d{2}$/;",
    "const ESCAPED = /\\\\([\\\\`*_{}#+\\-.!>~|])/g;",
    "const label = /^\\s*\\|([^|]*)\\|/.exec(edge); // mermaid edge label",
  ];
  const missed = planted.filter((text) => findTableReaders(text).length === 0);
  const falsePositives = clean.filter((text) => findTableReaders(text).length > 0);
  if (missed.length || falsePositives.length) {
    console.error(`self-test FAILED — missed: ${JSON.stringify(missed)}; false positives: ${JSON.stringify(falsePositives)}`);
    return 1;
  }
  console.log(`self-test ok — ${planted.length} planted readers found, ${clean.length} look-alikes ignored`);
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
            "Shrink-only baseline for `pnpm check:table-readers`: files with a private markdown-table reader (pipe split, leading-pipe detection, delimiter regex) instead of processors/utils/gfm-table-lines.ts. Prune with --prune-baseline; never add entries by hand.",
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
      const lines = findTableReaders(readFileSync(path.join(ROOT, file), "utf8")).map((hit) => `${file}:${hit.line} (${hit.shape})`);
      errors.push(`NEW private markdown-table reader in ${file} (${count} > baseline ${allowed}):\n    ${lines.join("\n    ")}`);
    }
  }
  for (const [file, allowed] of Object.entries(baseline)) {
    if ((now.get(file) ?? 0) < allowed) errors.push(`STALE baseline entry ${file} (${allowed} → ${now.get(file) ?? 0}) — run --prune-baseline`);
  }
  if (errors.length) {
    console.error(errors.join("\n"));
    console.error(
      "\nRead markdown tables through components/mardown-display/markdown-classification/processors/utils/gfm-table-lines.ts: " +
        "opensTable / findTableStart / findTableEnd to find one (edge pipes optional), isGfmDelimiterRow for the delimiter row, " +
        "rowCells for a row's cells, unescapeCellPipes for what a cell shows.",
    );
    return 1;
  }
  console.log(`table readers: ${now.size} baseline files, no new private table readers`);
  return 0;
}

process.exit(main());
