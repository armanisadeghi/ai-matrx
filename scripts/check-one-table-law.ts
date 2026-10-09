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
 * The marketing rules above stay ADVISORY (exit 0). They are joined by two
 * BLOCKING rules over the whole app (app/ features/ components/), added 2026-10-08
 * after pages kept switching off the canonical table's core features (Alchemy
 * copy-for-agent, toolbar, row copy) and hand-building tables:
 *
 *   copy-optout  (NO baseline) — a MatrxDataTable / EntityList config that
 *       switches copy or the toolbar off: `copy={false}` / `copy: false`,
 *       `showRow` / `showToolbar` false, `copyControls` carrying `false`, or
 *       `hideToolbar`. Genuine exception: put `// table-copy-optout: <reason>`
 *       on the same line or the line above. Place the control, never remove it.
 *   hand-table   (baseline) — a raw `<table>` or the shadcn Table primitives
 *       (components/ui/table) in a file not listed in
 *       scripts/one-table-law-baseline.json. New tables are MatrxDataTable.
 *       Baseline only shrinks; a stale entry WARNS ("remove from baseline").
 *       Excluded: markdown/chat renderers, app/(dev), app/(public), print
 *       layouts, the primitive itself, tests.
 *
 * Exit 1 on any copy-optout or hand-table finding.
 *
 *   pnpm check:one-table-law
 *   pnpm check:one-table-law --json
 *   pnpm check:one-table-law --self-test   # fixtures in a temp dir: RED per violation, GREEN on clean
 */
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { exitAfterDrain } from "./lib/exit-after-drain";
import { featureRegExp } from "./lib/source-roots.cjs";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
let ROOT = REPO_ROOT;
const SCAN_DIR = "features/marketing";
const APP_DIRS = ["app", "features", "components"];
const BASELINE_FILE = "scripts/one-table-law-baseline.json";
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
const SHARED_DATA_MODULE = featureRegExp(/features\/marketing\/seo\/keyword-table\//);

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


// ─── Whole-app BLOCKING rules ────────────────────────────────────────────────

const TEST_FILE = /\.(test|spec)\.tsx?$|(^|\/)(__tests__|__fixtures__)\//;

/** Where a hand-built table is legitimate (rendering content, not listing records). */
const HAND_TABLE_EXCLUDED =
  /^(components\/mardown-display\/|app\/\(dev\)\/|app\/\(public\)\/|components\/ui\/table\.tsx$)|(^|\/)print(s|ing)?(\/|[-.A-Z])|Print[A-Z\w]*\.tsx$/;

const USES_CANONICAL_TABLE = /MatrxDataTable|EntityList|matrx-data-table/;
const ESCAPE = /table-copy-optout:\s*\S/;

const COPY_OFF: Array<[RegExp, string]> = [
  [/\bcopy\s*=\s*\{\s*false\s*\}/, "copy={false}"],
  [/\bcopy\s*:\s*false\b/, "copy: false"],
  [/\bshowRow\s*(=\s*\{\s*false\s*\}|:\s*false\b)/, "showRow false"],
  [/\bshowToolbar\s*(=\s*\{\s*false\s*\}|:\s*false\b)/, "showToolbar false"],
  [/\bhideToolbar\b(?!\s*=\s*\{\s*false\s*\})(?!\s*:\s*false)/, "hideToolbar"],
];

/** `copyControls` is an object ({ row: false }) or a bare false; look through its literal. */
function copyControlsOff(lines: string[], at: number): boolean {
  if (!/\bcopyControls\b/.test(lines[at])) return false;
  const window = lines.slice(at, at + 5).join("\n");
  const end = window.search(/\}\s*\}|\}\s*,?\s*$|\/>/m);
  const literal = end >= 0 ? window.slice(0, end + 2) : window;
  return /\bfalse\b/.test(literal);
}

interface BlockingFinding {
  file: string;
  line: number;
  rule: "copy-optout" | "hand-table";
  detail: string;
}

function scanCopyOptOut(rel: string, source: string): BlockingFinding[] {
  if (TEST_FILE.test(rel) || !USES_CANONICAL_TABLE.test(source)) return [];
  const lines = source.split("\n");
  const out: BlockingFinding[] = [];
  lines.forEach((line, i) => {
    if (/^\s*(\/\/|\*|\/\*)/.test(line) && !/copyControls/.test(line)) return;
    if (ESCAPE.test(line) || (i > 0 && ESCAPE.test(lines[i - 1]))) return;
    const hit =
      COPY_OFF.find(([re]) => re.test(line))?.[1] ??
      (copyControlsOff(lines, i) ? "copyControls false" : null);
    if (hit) {
      out.push({
        file: rel,
        line: i + 1,
        rule: "copy-optout",
        detail: `\`${hit}\` switches off the table's core copy/toolbar features. Copy-for-agent (Alchemy) is never switched off: place it, don't remove it. Genuine exception: \`// table-copy-optout: <reason>\`.`,
      });
    }
  });
  return out;
}

const HAND_TABLE_SIGNS = [
  /<table[\s>]/,
  /from\s+["'](@\/)?components\/ui\/table["']/,
];

function handTableLine(rel: string, source: string): number {
  if (TEST_FILE.test(rel) || HAND_TABLE_EXCLUDED.test(rel)) return -1;
  const lines = source.split("\n");
  return lines.findIndex((l) => HAND_TABLE_SIGNS.some((re) => re.test(l)));
}

function loadBaseline(): string[] {
  const path = join(ROOT, BASELINE_FILE);
  if (!existsSync(path)) return [];
  return (JSON.parse(readFileSync(path, "utf8")).files ?? []) as string[];
}

interface BlockingResult {
  findings: BlockingFinding[];
  stale: string[];
  handTableFiles: string[];
  scanned: number;
}

function scanApp(baseline: string[]): BlockingResult {
  const files = APP_DIRS.flatMap((d) => walk(join(ROOT, d)));
  const findings: BlockingFinding[] = [];
  const handTableFiles: string[] = [];
  for (const file of files) {
    const rel = relative(ROOT, file).split("\\").join("/");
    const source = readFileSync(file, "utf8");
    findings.push(...scanCopyOptOut(rel, source));
    const at = handTableLine(rel, source);
    if (at >= 0) {
      handTableFiles.push(rel);
      if (!baseline.includes(rel)) {
        findings.push({
          file: rel,
          line: at + 1,
          rule: "hand-table",
          detail:
            "Hand-built table (raw <table> or components/ui/table). New tables are MatrxDataTable — it brings copy-for-agent, search, filters, resize, saved views and the row menu for free.",
        });
      }
    }
  }
  const stale = baseline.filter((b) => !handTableFiles.includes(b));
  return { findings, stale, handTableFiles, scanned: files.length };
}

function selfTest(): never {
  const tmp = mkdtempSync(join(tmpdir(), "one-table-law-"));
  const put = (rel: string, body: string) => {
    const full = join(tmp, rel);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, body);
  };
  const T = "import { MatrxDataTable } from '@/x/matrx-data-table/MatrxDataTable';\n";
  const cases: Array<[string, string, string]> = [
    ["copy={false}", "features/a/A.tsx", T + "export const A = () => <MatrxDataTable copy={false} />;\n"],
    ["copy: false", "features/a/B.tsx", T + "const t = { toolbar: { copy: false } };\n"],
    ["showRow false", "features/a/C.tsx", T + "const t = { copy: { showRow: false } };\n"],
    ["showToolbar={false}", "features/a/D.tsx", T + "export const D = () => <MatrxDataTable showToolbar={false} />;\n"],
    ["copyControls row false", "features/a/E.tsx", T + "export const E = () => <MatrxDataTable\n copyControls={{ row: false }}\n />;\n"],
    ["hideToolbar", "features/a/F.tsx", T + "export const F = () => <MatrxDataTable hideToolbar />;\n"],
    ["raw <table>", "features/a/G.tsx", "export const G = () => <table><tbody /></table>;\n"],
    ["shadcn Table", "app/x/H.tsx", "import { Table } from '@/components/ui/table';\nexport const H = () => <Table />;\n"],
  ];
  const clean: Array<[string, string, string]> = [
    ["clean MatrxDataTable", "features/a/Ok.tsx", T + "export const Ok = () => <MatrxDataTable copy={{ showRow: true }} />;\n"],
    ["escape comment", "features/a/Esc.tsx", T + "// table-copy-optout: embedded read-only preview\nexport const Esc = () => <MatrxDataTable copy={false} />;\n"],
    ["markdown renderer excluded", "components/mardown-display/Md.tsx", "export const Md = () => <table />;\n"],
    ["dev route excluded", "app/(dev)/x/page.tsx", "export default () => <table />;\n"],
    ["test file excluded", "features/a/A.test.tsx", "const x = <table />;\n"],
    ["table primitive excluded", "components/ui/table.tsx", "export const T = () => <table />;\n"],
  ];
  for (const [, rel, body] of [...cases, ...clean]) put(rel, body);
  put("features/a/Base.tsx", "export const Base = () => <table />;\n");
  put("features/a/Gone.tsx", "export const Gone = () => null;\n");

  ROOT = tmp;
  const result = scanApp(["features/a/Base.tsx", "features/a/Gone.tsx"]);
  let ok = true;
  const report = (label: string, pass: boolean, want: string) => {
    if (!pass) ok = false;
    console.log(`[${pass ? "OK" : "FAIL"}] ${label}: ${want}`);
  };
  for (const [label, rel] of cases) {
    const hit = result.findings.some((f) => f.file === rel);
    report(label, hit, "flagged (want flagged)");
  }
  for (const [label, rel] of clean) {
    const hit = result.findings.some((f) => f.file === rel);
    report(label, !hit, "not flagged (want not flagged)");
  }
  report(
    "baselined hand table",
    !result.findings.some((f) => f.file === "features/a/Base.tsx"),
    "not flagged (want not flagged)",
  );
  report(
    "stale baseline entry",
    result.stale.length === 1 && result.stale[0] === "features/a/Gone.tsx",
    "warn only, never a finding (want stale=Gone, no finding)",
  );
  report(
    "stale entry is not a finding",
    !result.findings.some((f) => f.file === "features/a/Gone.tsx"),
    "no finding",
  );
  rmSync(tmp, { recursive: true, force: true });
  console.log(ok ? "self-test: GREEN" : "self-test: FAILED");
  return exitAfterDrain(ok ? 0 : 1) as never;
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
  if (process.argv.includes("--self-test")) selfTest();
  const files = walk(join(ROOT, SCAN_DIR));
  const findings = files.flatMap(scan);
  const baseline = loadBaseline();
  const blocking = scanApp(baseline);

  if (json) {
    console.log(
      JSON.stringify({ findings, blocking, scanned: files.length }, null, 2),
    );
    exitAfterDrain(blocking.findings.length > 0 ? 1 : 0);
  }

  console.log(
    `\n${C.bold}${C.white}P26 + P28 — ONE TABLE, ONE DATA ACCESS SYSTEM${C.reset}`,
  );
  console.log(
    `${C.dim}Marketing (advisory): scanned ${files.length} files under ${SCAN_DIR}, ${Object.keys(ALLOWED).length} allowlisted. Whole app (blocking): scanned ${blocking.scanned} files, ${baseline.length} hand-built tables baselined.${C.reset}\n`,
  );

  const byRule = new Map<string, Array<Finding | BlockingFinding>>();
  for (const finding of [...findings, ...blocking.findings]) {
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

  for (const entry of blocking.stale) {
    console.log(
      `${C.yellow}warn${C.reset} ${entry} no longer has a hand-built table — remove from ${BASELINE_FILE}`,
    );
  }

  if (findings.length === 0 && blocking.findings.length === 0) {
    console.log(
      `${C.green}✓ Every table goes through the canonical table with its core features on.${C.reset}\n`,
    );
    exitAfterDrain(0);
  }

  if (blocking.findings.length > 0) {
    console.log(
      `${C.red}${C.bold}${blocking.findings.length} BLOCKING finding${blocking.findings.length === 1 ? "" : "s"}.${C.reset} ${C.dim}copy-optout: place the copy control, never remove it (or \`// table-copy-optout: <reason>\`). hand-table: use MatrxDataTable. Never add to ${BASELINE_FILE}.${C.reset}\n`,
    );
    exitAfterDrain(1);
  }

  console.log(
    `${C.red}${C.bold}${findings.length} advisory finding${findings.length === 1 ? "" : "s"}.${C.reset} ${C.dim}Fix it, or allowlist it WITH A REASON in scripts/check-one-table-law.ts.${C.reset}\n`,
  );
  exitAfterDrain(0);
}

main();
