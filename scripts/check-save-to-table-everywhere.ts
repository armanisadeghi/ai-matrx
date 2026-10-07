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
 *      `hasTableShape`, and the selection toolbar must keep `selection:save-to-table` — sent to
 *      the COMMON host half (VERIFIER-30: under the annotation key it never showed in Read mode),
 *      and both it and the registry read a rendered selection through `shapeTextOfNode`;
 *      Rows are not only tables-in-text: a tool result's object rows (`columns: TableColumn[]`),
 *      a transcript's lines (`TranscriptSegment`, meet's `groupTranscript`) and a message thread
 *      (`<ConversationView>`) are rows too (lane 3 W1.6). A renderer whose offer lives in another
 *      file names it in `OFFERED_BY`, and every file named there must itself offer.
 *   4. a table is born anywhere but the two named homes (VERIFIER-30 #5: a heatmap, a PDF
 *      extraction and the older importer each made their own) — `createTable` from the data
 *      seam or records' `declareTable` outside `BIRTH_HOMES`.
 *
 *   pnpm check:save-to-table-everywhere              the tree
 *   pnpm check:save-to-table-everywhere --self-test  proves each rule can fail
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { featureRegExp, gitFiles } from "./lib/source-roots.cjs";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Where a person meets content that can hold rows. */
export const CONTENT_ROOTS = [
  "app",
  "components/user-generated-table-data",
  "features/page-extraction",
  "components/mardown-display",
  "features/canvas/artifact-types",
  "features/rich-document",
  "features/tool-call-visualization", "../aidream/apps/shared/chat/src/tool-call-visualization",
  "features/content-ir",
  "components/selection-toolbar",
  "features/transcripts",
  "features/meet/components/record",
  "features/messaging",
];

/** A file that DRAWS a table-shaped value to a person. */
const SHAPE_MARKERS = [
  /\bparseMarkdownTable\(/, /\bdetectTabular\(/, /\bparseCsv\(/, /\bnormalizedData\b/, /\bparseFirstMarkdownTable\(/,
  /\bcolumns:\s*TableColumn\[\]/, // a tool result's object rows
  /\bTranscriptSegment\b/, /\bgroupTranscript\(/, // a transcript's lines
  /<ConversationView\b/, // a message thread
];

/** The ways a renderer offers the one action — directly, or by drawing a renderer that does. */
const OFFERS = [
  /\buseOpenSaveToTable\b/,
  /overlayId:\s*"saveToTable"/,
  // The chat package names host windows only through CHAT_WINDOWS (no-bare-overlay-id guard).
  /CHAT_WINDOWS\.saveToTable\b/,
  /<TableSaveToMenu\b/,
  /<StreamingTableRenderer\b/,
  /<MarkdownTable\b/,
  /<TableWithSeparatedControls\b/,
  /\btableRows:\s*\(/, // the rich-document registry's rows callback (its ⋯ and right-click carry it)
];

/**
 * Files that carry a marker and draw nothing a person could save — each with the reason. A new
 * entry is a claim a reviewer reads; keep it short and true.
 */
export const DRAWS_NO_ROWS: Record<string, string> = {
  "components/mardown-display/MarkdownRenderer.tsx": "draws TableWithSeparatedControls, which offers it",
  "components/mardown-display/markdown-classification/processors/utils/table-data-parser.tsx": "a parser; renders nothing",
  "components/mardown-display/tables/SaveTableModal.tsx": "the older-store save dialog the overlay itself opens",
  "components/mardown-display/blocks/transcripts/TranscriptViewer.tsx": "imported by nothing — drawn nowhere",
  "features/transcripts/components/CreateTranscriptModal.tsx": "a form that writes a new transcript; shows no saved lines",
  "features/transcripts/components/ImportTranscriptModal.tsx": "imports lines into a transcript; the block that opens it offers them",
  "features/transcripts/components/RecordingPreview.tsx": "a recording's live preview before it is a transcript",
  "features/messaging/lib/messagingAiDemand.tsx": "names ConversationView in a comment; draws nothing",
};

/**
 * Renderers whose rows are offered by another file — the host that draws them, or the menu beside
 * them. Every file in `by` must exist and itself offer; a stale claim fails rule 1. An empty `by`
 * is an offer another team owes; every run prints it.
 */
export const OFFERED_BY: Record<string, { by: readonly string[]; why: string }> = {
  "components/mardown-display/blocks/transcripts/AdvancedTranscriptViewer.tsx": {
    by: ["features/transcripts/components/TranscriptViewer.tsx", "components/mardown-display/blocks/transcripts/TranscriptBlock.tsx"],
    why: "the transcript body its two hosts draw; each host offers the lines",
  },
  "features/meet/components/record/TranscriptPanel.tsx": {
    by: ["features/meet/components/record/RecordExportMenu.tsx"],
    why: "the meeting record's Export menu offers the transcript lines",
  },
};

/** The only files that may make a table themselves, each with why. */
export const BIRTH_HOMES: Record<string, string> = {
  "components/mardown-display/tables/SaveTableModal.tsx": "the older-store branch the saveToTable overlay opens, until the final switch",
  "components/user-generated-table-data/CreateTableModal.tsx": "the older /data home's table builder: columns typed by hand with no rows (no shape to save), retired with the older store",
  "features/make/MakeHome.tsx": "/make's New table: an empty table named before anything is typed — no rows, no shape to save",
};

/** The one place the older-store dialog may be opened from. */
const SAVE_TABLE_MODAL_HOME = "features/save-to-table/SaveToTableOverlay.tsx";

export interface Finding {
  rule: 1 | 2 | 3 | 4;
  file: string;
  says: string;
}

export function judge(files: ReadonlyMap<string, string>): Finding[] {
  const out: Finding[] = [];
  for (const [file, text] of files) {
    const inRoots = CONTENT_ROOTS.some((r) => file.startsWith(`${r}/`));
    if (inRoots && file.endsWith(".tsx") && !/\.test\.tsx$/.test(file) && !file.includes("__tests__")) {
      const draws = SHAPE_MARKERS.some((m) => m.test(text));
      const offers = OFFERS.some((m) => m.test(text));
      const elsewhere = OFFERED_BY[file];
      if (draws && !(file in DRAWS_NO_ROWS) && !offers && !elsewhere) {
        out.push({ rule: 1, file, says: "draws rows and offers no Save to a table (use useOpenSaveToTable, or draw TableSaveToMenu)" });
      }
      if (draws && !offers && elsewhere) {
        for (const by of elsewhere.by) {
          const host = files.get(by);
          if (host === undefined || !OFFERS.some((m) => m.test(host))) {
            out.push({ rule: 1, file, says: `OFFERED_BY names ${by}, which does not offer Save to a table` });
          }
        }
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
  for (const [file, text] of files) {
    if (file in BIRTH_HOMES || /\.test\.tsx?$/.test(file) || file.includes("__tests__") || file.startsWith("features/data-tables/")) continue;
    const seamBirth = featureRegExp(/\bcreateTable\b[^;]*from\s+["']@\/features\/data-tables\/service["']/).test(text) && /\bcreateTable\(/.test(text);
    const storeBirth = /\bdeclareTable\b[^;]*from\s+["']@ai-matrx\/records(-ui)?(\/core)?["']/.test(text);
    if (seamBirth || storeBirth) {
      out.push({ rule: 4, file, says: "makes a table itself — open the saveToTable overlay (useOpenSaveToTable) instead" });
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
  const shapeRead = files.get("components/selection-toolbar/selection-shape.ts") ?? "";
  const toolbarRoot = files.get("components/selection-toolbar/SelectionToolbarRoot.tsx") ?? "";
  const registryReads = /liveSelectionShapeText\(/.test(registry);
  if (!/shapeTextOfNode\(/.test(shapeRead) || !/liveSelectionShapeText\(/.test(toolbarRoot) || !registryReads) {
    out.push({ rule: 3, file: "components/selection-toolbar/selection-shape.ts", says: "a selection over rendered content is read flattened — the toolbar and the registry must read it through shapeTextOfNode (liveSelectionShapeText)" });
  }
  const hosts = files.get("components/selection-toolbar/selection-actions.ts") ?? "";
  const keyLine = hosts.split("\n").find((l) => l.includes("return SELECTION_COMMON_HOST_KEY")) ?? "";
  if (!keyLine.includes('"selection:save-to-table"')) {
    out.push({ rule: 3, file: "components/selection-toolbar/selection-actions.ts", says: "hostKeyOf does not send selection:save-to-table to the common host half, so Read mode never shows it" });
  }
  return out;
}

function tree(): Map<string, string> {
  const listed = gitFiles(REPO, ["ls-files", "--cached", "--others", "--exclude-standard", "--", "components", "features", "../aidream/apps/shared/chat/src", "app", "lib"])
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
  const birth = new Map(base);
  birth.set("features/page-extraction/fixture/Planted.ts", 'import { createTable } from "@/features/data-tables/service";\nawait createTable({ tableName: "x" });');
  if (!judge(birth).some((f) => f.rule === 4)) throw new Error("rule 4 did not fire on a table born outside the homes");
  const toolbar = new Map(base);
  toolbar.set("components/selection-toolbar/selection-actions.ts", (base.get("components/selection-toolbar/selection-actions.ts") ?? "").replace(' || id === "selection:save-to-table"', ""));
  if (!judge(toolbar).some((f) => f.rule === 3)) throw new Error("rule 3 did not fire when the toolbar key fell back to the annotation host");
  const flat = new Map(base);
  flat.set("components/selection-toolbar/selection-shape.ts", "export function liveSelectionShapeText() { return null; }");
  if (!judge(flat).some((f) => f.rule === 3)) throw new Error("rule 3 did not fire when the selection was read flattened");
  const lost = new Map(base);
  lost.set("features/rich-document/actions/handlers/transfer.ts", (base.get("features/rich-document/actions/handlers/transfer.ts") ?? "").replace(/hasTableShape\(/g, "parseFirstMarkdownTable("));
  if (!judge(lost).some((f) => f.rule === 3)) throw new Error("rule 3 did not fire when the registry stopped reading every shape");
  // W1.6: the widened roots — a tool-result table, a transcript, a thread that offer nothing.
  for (const [path, body] of [
    ["../aidream/apps/shared/chat/src/tool-call-visualization/result-fields/PlantedRows.tsx", "export function T({ columns }: { columns: TableColumn[] }) { return <table/>; }"],
    ["features/transcripts/components/PlantedLines.tsx", "import type { TranscriptSegment } from '../types';\nexport const L = (p: { s: TranscriptSegment[] }) => <ol/>;"],
    ["features/meet/components/record/PlantedBlocks.tsx", "export const B = ({ b }) => <ol>{groupTranscript(b.transcript).map(() => null)}</ol>;"],
    ["features/messaging/components/PlantedThread.tsx", "export const P = () => <ConversationView conversationId={id} />;"],
  ] as const) {
    const widened = new Map(base);
    widened.set(path, body);
    if (!judge(widened).some((f) => f.rule === 1 && f.file === path)) throw new Error(`rule 1 did not fire on ${path}`);
  }
  // A surface that lost its offer, and an OFFERED_BY claim gone stale.
  for (const host of ["features/messaging/components/ConversationPane.tsx", "features/transcripts/components/TranscriptViewer.tsx", "features/meet/components/record/RecordExportMenu.tsx", "components/mardown-display/blocks/transcripts/TranscriptBlock.tsx"]) {
    const lost = new Map(base);
    lost.set(host, (base.get(host) ?? "").replace(/useOpenSaveToTable/g, "useOpenNothing").replace(/tableRows:\s*\(/g, "rows: ("));
    if (!judge(lost).some((f) => f.rule === 1)) throw new Error(`rule 1 did not fire when ${host} stopped offering`);
  }
  console.log("✓ self-test: each of the four rules fails when broken (incl. tool results, transcripts, messaging), and the tree is green");
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
  // Nothing waits silently: a renderer whose offer is owed by another team is named on every run.
  for (const [file, { by, why }] of Object.entries(OFFERED_BY)) if (by.length === 0) console.log(`  ! still owed: ${file} — ${why}`);
}
