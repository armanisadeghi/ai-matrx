#!/usr/bin/env npx tsx
/**
 * check:one-table-law — P26 + P28, enforced by a script that reads code.
 *
 * Arman, 2026-08-24, after finding the topic tree's unplaced queue rendering
 * 26,115 keywords as a hand-rolled `<div>` list — no table header, no sortable
 * column, no filter, none of the dimension columns the same keywords carry in
 * the Keyword Workbench one screen away:
 *
 *   "whoever made this table didn't bring over the full functionality of our
 *    table system… all they had to do is just use the canonical table… we've
 *    gotta also make it where the rule is anywhere the table appears."
 *
 * SoR: common-docs/systems/marketing/seo/seo-keywords/keyword-system-decisions.md
 *   • P26 — a table is the user's; a surface may change which columns SHOW,
 *     never whether they sort or filter.
 *   • P28 — one data access system underneath it.
 *
 * WHAT THIS FLAGS, inside `features/marketing/**` only:
 *   1. A GRID: a component that renders `<table>` / `<tbody>` / a CSS grid of
 *      header cells, without importing `MatrxDataTable`.
 *   2. A KEYWORD LIST: a component that maps rows carrying keyword-shaped
 *      fields (`keyword_id`, `phrase`/`key` + `clicks`/`impressions`) into JSX
 *      rows, without importing `MatrxDataTable` — the exact shape of the two
 *      queues this law was written for.
 *   3. A SECOND KEYWORD QUERY: a call to a keyword-list RPC other than the
 *      canonical `gsc_perf_breakdown`, outside the shared data module.
 *
 * ALLOWLIST: genuinely non-tabular UI, each with a stated reason. A tree is a
 * tree; a chart is a chart. Add to `ALLOWED` below and say WHY — an entry with
 * no reason is itself a finding.
 *
 * Loud, ADVISORY, never blocking (exit 0 always — the repo's scream-never-block
 * rule). A finding is a question: "should this be the canonical table?" For the
 * lists this law was written about, the answer was yes.
 *
 *   pnpm check:one-table-law
 *   pnpm check:one-table-law --json
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SCAN_DIR = "features/marketing";
const SKIP_DIR =
  /(^|\/)(node_modules|\.next[^/]*|dist|build|coverage|__tests__|\.git)(\/|$)/;

const C = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  white: "\x1b[97m",
};

/**
 * Files that legitimately render something that is NOT a table. Every entry
 * carries its reason, because "it was already like that" is not one.
 */
const ALLOWED: Record<string, string> = {
  "features/marketing/seo/value-system/topics/TopicTreeRow.tsx":
    "The topic TREE is genuinely a tree — nesting, expand/collapse and lineage are the point. Its keyword LISTS are tables and obey the law.",
  "features/marketing/seo/value-system/topics/TopicTreeWorkbench.tsx":
    "Hosts the tree above; both of its keyword lists render <KeywordTable>.",
  "features/marketing/seo/value-system/topics/TopicPickerDialog.tsx":
    "A tree picker inside a dialog — choosing a node in a hierarchy, not listing rows.",
  "features/marketing/seo/value-system/dimensions/DimensionCard.tsx":
    "A card view of ONE dimension and its values — an editor, not a list of records.",
  "features/marketing/seo/value-system/dimensions/DimensionManager.tsx":
    "A gallery of dimension cards. Carries no keyword rows; revisit if it ever grows metrics per row.",
};

/** A grid drawn by hand rather than by the canonical table. */
const HAND_GRID =
  /<(table|tbody|thead)\b|role=["']table["']|role=["']rowgroup["']/;

/** Row shapes that mean "this list is keywords". */
const KEYWORD_ROW_FIELDS = [
  /\brow\.keyword_id\b/,
  /\bkeyword_id:\s*string\b/,
  /\brow\.phrase\b/,
];
const KEYWORD_METRIC_FIELDS = [/\brow\.clicks\b/, /\brow\.impressions\b/];

/** Mapping rows into JSX — the hand-rolled list smell. */
const ROWS_MAPPED = /\brows\s*\.\s*map\s*\(|\bdata\s*\.\s*rows\s*\.\s*map\s*\(/;

const CANONICAL_TABLE = /matrx-data-table\/MatrxDataTable|MatrxDataTable/;

/**
 * Keyword-list RPCs that are NOT the canonical one. `gsc_perf_breakdown` is
 * the ONE door (P28); anything else that returns a page of keywords with
 * metrics is a second contract.
 */
const SECOND_QUERY =
  /rpc\(\s*["'](gsc_topic_unassigned_keywords|gsc_topic_proposed_keywords|site_keyword_performance_page)["']/;

/** The shared data module IS the one door — it is allowed to name the RPC. */
const SHARED_DATA_MODULE = /features\/marketing\/seo\/keyword-table\//;

interface Finding {
  file: string;
  line: number;
  rule: "hand-grid" | "keyword-list" | "second-query";
  detail: string;
}

function walk(dir: string, out: string[] = []): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = join(dir, entry);
    if (SKIP_DIR.test(full)) continue;
    let stat;
    try {
      stat = statSync(full);
    } catch {
      continue;
    }
    if (stat.isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

function scan(file: string): Finding[] {
  const rel = relative(ROOT, file);
  if (ALLOWED[rel]) return [];
  const source = readFileSync(file, "utf8");
  const lines = source.split("\n");
  const usesCanonical = CANONICAL_TABLE.test(source);
  const findings: Finding[] = [];

  if (!usesCanonical) {
    const gridLine = lines.findIndex((l) => HAND_GRID.test(l));
    if (gridLine >= 0) {
      findings.push({
        file: rel,
        line: gridLine + 1,
        rule: "hand-grid",
        detail:
          "Renders a grid by hand and never imports MatrxDataTable. Every column a person sees here has to sort and filter (P26).",
      });
    }

    // A `.ts` formatter that maps rows into STRINGS is not a table. Only a
    // component file can render one.
    const rendersJsx = rel.endsWith(".tsx");
    const hasKeywordRow =
      rendersJsx && KEYWORD_ROW_FIELDS.some((re) => re.test(source));
    const hasMetrics = KEYWORD_METRIC_FIELDS.some((re) => re.test(source));
    const mapsRows = ROWS_MAPPED.test(source);
    if (hasKeywordRow && hasMetrics && mapsRows && gridLine < 0) {
      const at = lines.findIndex((l) => ROWS_MAPPED.test(l));
      findings.push({
        file: rel,
        line: at + 1,
        rule: "keyword-list",
        detail:
          "Maps keyword rows with metrics into JSX without the canonical table — the exact shape that shipped 26,115 unsortable keywords. Use <KeywordTable> (features/marketing/seo/keyword-table/).",
      });
    }
  }

  if (!SHARED_DATA_MODULE.test(rel)) {
    lines.forEach((line, index) => {
      const match = line.match(SECOND_QUERY);
      if (match) {
        findings.push({
          file: rel,
          line: index + 1,
          rule: "second-query",
          detail: `Second keyword query \`${match[1]}\`. P28 — one data access system: read through useKeywordRows (seo.gsc_perf_breakdown) and EXTEND that RPC when it cannot express your surface.`,
        });
      }
    });
  }

  return findings;
}

function main(): void {
  const json = process.argv.includes("--json");
  const files = walk(join(ROOT, SCAN_DIR));
  const findings = files.flatMap(scan);

  if (json) {
    console.log(JSON.stringify({ findings, scanned: files.length }, null, 2));
    process.exit(0);
  }

  console.log(
    `\n${C.bold}${C.white}P26 + P28 — ONE TABLE, ONE DATA ACCESS SYSTEM${C.reset}`,
  );
  console.log(
    `${C.dim}Scanned ${files.length} files under ${SCAN_DIR}. ${Object.keys(ALLOWED).length} allowlisted (non-tabular, with reasons).${C.reset}\n`,
  );

  if (findings.length === 0) {
    console.log(
      `${C.green}✓ Every keyword-bearing list under ${SCAN_DIR} goes through the canonical table.${C.reset}\n`,
    );
    process.exit(0);
  }

  const byRule = new Map<string, Finding[]>();
  for (const finding of findings) {
    const list = byRule.get(finding.rule) ?? [];
    list.push(finding);
    byRule.set(finding.rule, list);
  }

  for (const [rule, list] of byRule) {
    console.log(`${C.yellow}${C.bold}${rule} (${list.length})${C.reset}`);
    for (const finding of list) {
      console.log(`  ${C.cyan}${finding.file}:${finding.line}${C.reset}`);
      console.log(`    ${C.dim}${finding.detail}${C.reset}`);
    }
    console.log("");
  }

  console.log(
    `${C.red}${C.bold}${findings.length} finding${findings.length === 1 ? "" : "s"}.${C.reset} ${C.dim}Advisory — this never blocks. Fix it, or allowlist it WITH A REASON in scripts/check-one-table-law.ts.${C.reset}\n`,
  );
  process.exit(0);
}

main();
