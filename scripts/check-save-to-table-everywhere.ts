/**
 * check:save-to-table-everywhere — every surface that shows rows offers the ONE "Save to a table".
 *
 * Arman, 2026-09-29: anywhere information appears in a shape the system understands (a markdown
 * table, a list or a few bullets, Key: value lines, CSV/TSV, a kind value, an agent's answer, a
 * note…) the SAME action exists — a new table, or rows added to one — and it is ONE primitive,
 * never rebuilt per surface (lane SAVE-AS-TABLE-EVERYWHERE). This guard fails when:
 *
 *   1. a renderer under the content roots draws a table-shaped value (it parses a markdown table,
 *      CSV or JSON rows, or holds `normalizedData`) and reaches neither the `saveToTable` overlay
 *      (`useOpenSaveToTable` / `overlayId: "saveToTable"`) nor a renderer that does
 *      (`TableSaveToMenu`, `StreamingTableRenderer`, `MarkdownTable`, `TableWithSeparatedControls`);
 *   2. a second save path appears: `SaveTableModal` imported anywhere but the overlay's older-store
 *      branch, or `createDatasetFromTable` anywhere at all;
 *   3. the two menus that carry the action for EVERY shape stop carrying it: the rich-document
 *      registry (chat ⋯ and right-click, notes, every RichDocument) must offer it by
 *      `hasTableShape`, and the selection toolbar must keep `selection:save-to-table`.
 *
 *   pnpm check:save-to-table-everywhere              the tree
 *   pnpm check:save-to-table-everywhere --self-test  proves each rule can fail
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Where a person meets content that can hold rows. */
export const CONTENT_ROOTS = [
  "components/mardown-display",
  "features/canvas/artifact-types",
  "features/rich-document",
  "features/tool-call-visualization",
  "features/content-ir",
  "components/selection-toolbar",
];

/** A file that DRAWS a table-shaped value to a person. */
const SHAPE_MARKERS = [/\bparseMarkdownTable\(/, /\bdetectTabular\(/, /\bparseCsv\(/, /\bnormalizedData\b/, /\bparseFirstMarkdownTable\(/];

/** The ways a renderer offers the one action — directly, or by drawing a renderer that does. */
const OFFERS = [
  /\buseOpenSaveToTable\b/,
  /overlayId:\s*"saveToTable"/,
  /<TableSaveToMenu\b/,
  /<StreamingTableRenderer\b/,
  /<MarkdownTable\b/,
  /<TableWithSeparatedControls\b/,
];

/**
 * Files that carry a marker and draw nothing a person could save — each with the reason. A new
 * entry is a claim a reviewer reads; keep it short and true.
 */
export const DRAWS_NO_ROWS: Record<string, string> = {
  "components/mardown-display/MarkdownRenderer.tsx": "draws TableWithSeparatedControls, which offers it",
  "components/mardown-display/markdown-classification/processors/utils/table-data-parser.tsx": "a parser; renders nothing",
  "components/mardown-display/tables/SaveTableModal.tsx": "the older-store save dialog the overlay itself opens",
};

/** The one place the older-store dialog may be opened from. */
const SAVE_TABLE_MODAL_HOME = "features/save-to-table/SaveToTableOverlay.tsx";

export interface Finding {
  rule: 1 | 2 | 3;
  file: string;
  says: string;
}

export function judge(files: ReadonlyMap<string, string>): Finding[] {
  const out: Finding[] = [];
  for (const [file, text] of files) {
    const inRoots = CONTENT_ROOTS.some((r) => file.startsWith(`${r}/`));
    if (inRoots && file.endsWith(".tsx") && !/\.test\.tsx$/.test(file) && !file.includes("__tests__")) {
      const draws = SHAPE_MARKERS.some((m) => m.test(text));
      if (draws && !(file in DRAWS_NO_ROWS) && !OFFERS.some((m) => m.test(text))) {
        out.push({ rule: 1, file, says: "draws rows and offers no Save to a table (use useOpenSaveToTable, or draw TableSaveToMenu)" });
      }
    }
    if (file !== SAVE_TABLE_MODAL_HOME && file !== "components/mardown-display/tables/SaveTableModal.tsx" && !/\.test\.tsx?$/.test(file)) {
      if (/from\s+["'][^"']*\/SaveTableModal["']/.test(text)) {
        out.push({ rule: 2, file, says: "opens SaveTableModal itself — a second save path beside the saveToTable overlay" });
      }
    }
    if (/\bcreateDatasetFromTable\b/.test(text) && !file.startsWith("scripts/check-save-to-table-everywhere")) {
      out.push({ rule: 2, file, says: "createDatasetFromTable was replaced by the saveToTable overlay" });
    }
  }
  const registry = files.get("features/rich-document/actions/handlers/transfer.ts") ?? "";
  if (!/hasTableShape\(/.test(registry) || !/overlayId:\s*"saveToTable"/.test(registry)) {
    out.push({ rule: 3, file: "features/rich-document/actions/handlers/transfer.ts", says: "the registry no longer offers Save to a table for every shape (hasTableShape → saveToTable)" });
  }
  const selection = files.get("components/selection-toolbar/common-actions.ts") ?? "";
  if (!selection.includes('"selection:save-to-table"')) {
    out.push({ rule: 3, file: "components/selection-toolbar/common-actions.ts", says: "the selection toolbar lost selection:save-to-table" });
  }
  return out;
}

function tree(): Map<string, string> {
  const listed = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "--", "components", "features", "app", "lib"], {
    cwd: REPO,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  })
    .split("\n")
    .filter((f) => /\.(tsx?|mts)$/.test(f));
  const files = new Map<string, string>();
  for (const f of listed) {
    try {
      files.set(f, readFileSync(join(REPO, f), "utf8"));
    } catch {
      // A path git still lists but the tree no longer holds (a deletion not yet committed).
    }
  }
  return files;
}

function selfTest(): void {
  const base = tree();
  const green = judge(base);
  if (green.length) throw new Error(`self-test needs a green tree first:\n${green.map((f) => `  ${f.file}: ${f.says}`).join("\n")}`);
  const planted = new Map(base);
  planted.set("components/mardown-display/blocks/fixture/PlantedRowsBlock.tsx", "export const X = () => { const t = parseMarkdownTable(c); return <table/>; };");
  if (!judge(planted).some((f) => f.rule === 1)) throw new Error("rule 1 did not fire on a renderer that offers nothing");
  const second = new Map(base);
  second.set("components/mardown-display/blocks/fixture/Second.tsx", 'import SaveTableModal from "../../tables/SaveTableModal";');
  if (!judge(second).some((f) => f.rule === 2)) throw new Error("rule 2 did not fire on a second save path");
  const lost = new Map(base);
  lost.set("features/rich-document/actions/handlers/transfer.ts", (base.get("features/rich-document/actions/handlers/transfer.ts") ?? "").replace(/hasTableShape\(/g, "parseFirstMarkdownTable("));
  if (!judge(lost).some((f) => f.rule === 3)) throw new Error("rule 3 did not fire when the registry stopped reading every shape");
  console.log("✓ self-test: each of the three rules fails when broken, and the tree is green");
}

const argv = process.argv.slice(2);
if (argv.includes("--self-test")) {
  selfTest();
} else {
  const findings = judge(tree());
  if (findings.length) {
    console.log(`✗ ${findings.length} place(s) break the one Save to a table:`);
    for (const f of findings) console.log(`    [rule ${f.rule}] ${f.file} — ${f.says}`);
    process.exit(1);
  }
  console.log("✓ every surface that draws rows offers the one Save to a table; no second save path; both menus carry it");
}
