#!/usr/bin/env npx tsx
/**
 * THE EDITOR ROUND-TRIP CORPUS — the rich-content editor (RC-B4) judged over EVERY stored row,
 * through the editor's OWN load/save path, headless (a real Tiptap `Editor`, no DOM).
 *
 * "Switching between their rich text and our previews and displays will never make the core
 * data change unless we make that change into the rule." (Arman, 2026-09-23)
 *
 * Per stored text:
 *   visual_noop      open in the visual editor → write it back with no edit = the stored bytes
 *   view_switch      visual → source → visual again → write back = the stored bytes
 *   noop_save        the save gate (planSave) on that result: unchanged, nothing to store
 *   edit_local       type " [edited]" at the end of the first editable paragraph:
 *                      · bytes outside that paragraph's block are identical
 *                      · the result is EXACTLY the stored text with those 9 characters inserted
 *                        where the paragraph ends (nothing else in the block moved)
 *                      · the save gate accepts it with no island question
 *                      · every island (kinds, XML, fences, math, {{vars}}, tags, anchors, HTML)
 *                        is still there byte-for-byte
 *                      · no backslash was introduced
 *   move_blocks      (3+ top-level blocks) drag the first block below the third through the
 *                    editor's OWN plugins, tagged as a drop exactly like ProseMirror's drop
 *                    handler — so every appendTransaction plugin runs (Tiptap's paste rules once
 *                    rewrote untouched links this way):
 *                      · every block that did not move is still its baseline node (source
 *                        identity: it will be written back as its stored bytes)
 *                      · dragging it back returns the stored bytes exactly
 *   table_cells      for every editable stored table: append " X" to each cell of the first body
 *                    row and of every row holding an escaped or structural cell (`\|`, `\`,
 *                    code, links, islands, math, HTML):
 *                      · exactly one line of the document changes (the edited row)
 *                      · in that row only the edited cell's segment changes, and it is the old
 *                        cell plus " X" — every neighbour keeps its bytes, escapes and padding
 *   answer_tables    the in-body answer table editors' path (parseMarkdownTable → edit →
 *                    rewriteTableSource, THE table writer): for every table in a prose block,
 *                    no edit returns its bytes, and the same " X" cell edits change only that cell
 *
 * Rows come from the shared corpus reader (scripts/lib/rich-content-corpus.ts) — the same rows
 * the tokenizer gate (check-source-roundtrip-corpus.ts) judges. READ ONLY. Nothing a person
 * wrote is printed: failures report the row id and the reason only.
 *
 * Usage:
 *   npx tsx scripts/check-rich-editor-roundtrip-corpus.ts            # every source
 *   … --only notes                    # one source
 *   … --limit 2000                    # first N rows per source (a quick run)
 *   … --json <file>                   # full report as JSON
 *
 * Exit 0 only when every row passes every check.
 */
import { writeFileSync } from "node:fs";
import { Editor, getSchema, type JSONContent } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";
import { EditorState, NodeSelection } from "@tiptap/pm/state";
import { listIslands, tokenizeSource } from "@ai-matrx/content-ir/source";
import { connectDirect, loadDbEnv } from "./lib/direct-db";
import { exitAfterDrain, installBlockingStdio } from "./lib/exit-after-drain";
import {
  CORPUS_SOURCES,
  readCorpusSource,
  type CorpusSourceName,
} from "./lib/rich-content-corpus";
import { createRichEditorExtensions } from "../components/rich-editor/core/extensions";
import {
  buildVisualDocument,
  captureBaseline,
  serializeVisualDocument,
  type VisualPlan,
} from "../components/rich-editor/core/visual-document";
import { planSave } from "../components/rich-editor/core/save-plan";
import { rewriteTableSource, splitRowSegments } from "../components/rich-editor/core/table-source";
import { parseMarkdownTable } from "../components/mardown-display/blocks/table/parseMarkdownTable";
import { oracleTableGrid } from "./lib/gfm-table-oracle";

const args = process.argv.slice(2);
const argValue = (flag: string): string | undefined => {
  const index = args.indexOf(flag);
  return index === -1 ? undefined : args[index + 1];
};
const only = argValue("--only") as CorpusSourceName | undefined;
const jsonOut = argValue("--json");
const limit = argValue("--limit") ? Number(argValue("--limit")) : Number.POSITIVE_INFINITY;
const SLOW_MS = 2000;
const EDIT = " [edited]";

const extensions = createRichEditorExtensions();
const schema = getSchema(extensions);

interface SourceStats {
  rows: number;
  passed: number;
  editedRows: number;
  movedRows: number;
  cellEdits: number;
  answerCellEdits: number;
  proseBlocks: number;
  lockedBlocks: number;
  lockedChildren: number;
  editableChildren: number;
  islandBlocks: number;
  failures: Array<{ id: string; reason: string }>;
  slow: Array<{ id: string; ms: number }>;
}

const lockReasons = new Map<string, number>();

function openEditor(json: JSONContent): Editor {
  return new Editor({ element: null, extensions, content: json });
}

function countBackslashes(text: string): number {
  let count = 0;
  for (let i = 0; i < text.length; i += 1) if (text.charCodeAt(i) === 92) count += 1;
  return count;
}

function islandMultiset(text: string): Map<string, number> {
  const out = new Map<string, number>();
  for (const island of listIslands(tokenizeSource(text))) {
    const key = `${island.islandType}\u0000${island.raw}`;
    out.set(key, (out.get(key) ?? 0) + 1);
  }
  return out;
}

interface EditTarget {
  /** ProseMirror position just inside the paragraph's end. */
  pos: number;
  /** Source offset where the paragraph's stored bytes end. */
  offset: number;
  blockStart: number;
  blockEnd: number;
}

/** The first editable paragraph that is a direct child of a stored prose block. */
function findEditTarget(doc: PMNode, plan: VisualPlan): EditTarget | null {
  let target: EditTarget | null = null;
  doc.forEach((top, topOffset) => {
    if (target || top.type.name !== "sourceBlock") return;
    const b = top.attrs.b;
    const block = typeof b === "number" ? plan.blocks[b] : undefined;
    if (!block) return;
    let consumed = 0;
    top.forEach((child, childOffset) => {
      if (target) return;
      const id = typeof child.attrs.mdId === "string" ? child.attrs.mdId : null;
      const raw = id ? plan.childRaw.get(id) : undefined;
      if (raw === undefined) return;
      if (child.type.name === "paragraph") {
        target = {
          pos: topOffset + 1 + childOffset + 1 + child.content.size,
          offset: block.start + consumed + raw.length,
          blockStart: block.start,
          blockEnd: block.end,
        };
        return;
      }
      consumed += raw.length + (plan.adjacency.get(id ?? "")?.trail ?? "").length;
    });
  });
  return target;
}

function topOffset(doc: PMNode, index: number): number {
  let pos = 0;
  for (let i = 0; i < index; i += 1) pos += doc.child(i).nodeSize;
  return pos;
}

/** ProseMirror's own drop of a dragged top-level block: delete it, insert it at the mapped point. */
function dropTop(state: EditorState, from: number, to: number): EditorState {
  const selected = state.apply(state.tr.setSelection(NodeSelection.create(state.doc, topOffset(state.doc, from))));
  const node = selected.doc.child(from);
  const tr = selected.tr;
  tr.deleteSelection();
  const pos = tr.mapping.map(topOffset(selected.doc, to));
  tr.replaceRangeWith(pos, pos, node);
  return selected.apply(tr.setMeta("uiEvent", "drop"));
}

/** Move the first block below the third and back, through every plugin. Returns a reason or null. */
function judgeMove(editor: Editor, baseline: ReturnType<typeof captureBaseline>, text: string): string | null {
  const doc = editor.state.doc;
  if (doc.childCount < 3) return null;
  const state = EditorState.create({ doc, plugins: editor.extensionManager.plugins });
  const moved = dropTop(state, 0, 3);
  if (moved.doc.childCount !== doc.childCount) return "move_changed_block_count";
  // The moved block now sits at index 2; every other block must be its baseline node.
  for (let i = 0; i < moved.doc.childCount; i += 1) {
    if (i === 2) continue;
    const node = moved.doc.child(i);
    const b = node.attrs.b;
    const original = typeof b === "number" ? baseline.topNodes.get(b) : undefined;
    const expected = doc.child(i < 2 ? i + 1 : i);
    if (!(original ? original.eq(node) : expected.eq(node))) return "move_rewrote_untouched_block";
  }
  const back = dropTop(moved, 2, 0);
  if (serializeVisualDocument(back.doc, baseline) !== text) return "move_back_changed_bytes";
  return null;
}

const STRUCTURAL = /[\\`[\]{}$<|]/;
const MAX_CELL_EDITS = 60;

/** Row segments for the line-level check (the oracle below is the independent judge). */
const rowSegments = splitRowSegments;

/** The table block (contiguous non-blank lines holding a pipe) around line `at`. */
function blockAround(lines: readonly string[], at: number): string {
  let start = at;
  let end = at;
  while (start > 0 && (lines[start - 1] ?? "").trim() && (lines[start - 1] ?? "").includes("|")) start -= 1;
  while (end + 1 < lines.length && (lines[end + 1] ?? "").trim() && (lines[end + 1] ?? "").includes("|")) end += 1;
  return lines.slice(start, end + 1).join("\n");
}

/**
 * The INDEPENDENT judgment (micromark, scripts/lib/gfm-table-oracle.ts — never
 * the splitter under test): read before and after as GFM tables; exactly one
 * cell may differ, and it must be the old cell plus " X".
 */
function oracleJudge(before: string, after: string, prefix: string): string | null {
  const g0 = oracleTableGrid(before);
  const g1 = oracleTableGrid(after);
  if (!g0) return null;
  if (!g1) return `${prefix}_oracle_no_table_after`;
  if (g0.length !== g1.length) return `${prefix}_oracle_row_count_changed`;
  const diffs: Array<[string, string]> = [];
  for (let r = 0; r < g0.length; r += 1) {
    const a = g0[r] ?? [];
    const b = g1[r] ?? [];
    for (let c = 0; c < Math.max(a.length, b.length); c += 1) {
      if ((a[c] ?? "") !== (b[c] ?? "")) diffs.push([a[c] ?? "", b[c] ?? ""]);
    }
  }
  // No visible change: the edit landed in a cell beyond the header width, which GFM
  // does not display (the line-level check already proved only that cell's bytes moved).
  if (diffs.length === 0) return null;
  if (diffs.length !== 1) return `${prefix}_oracle_other_cells_changed`;
  const [was, now] = diffs[0] as [string, string];
  if (now !== `${was} X`.trim()) return `${prefix}_oracle_wrong_cell_text`;
  return null;
}

/** Append " X" to cells of tables; only that cell's bytes may change. Returns a reason or null. */
function judgeTableCells(editor: Editor, baseline: ReturnType<typeof captureBaseline>, text: string, stats: SourceStats): string | null {
  const doc = editor.state.doc;
  const targets: number[] = [];
  doc.descendants((node, pos) => {
    if (node.type.name !== "table") return true;
    let rowPos = pos + 1;
    node.forEach((row, _offset, rowIndex) => {
      const raw = String(row.attrs.mdRaw ?? "");
      if (rowIndex === 1 || STRUCTURAL.test(raw)) {
        // Only cells the row actually stores (a short row's padding cells have no bytes yet).
        const segs = rowSegments(raw);
        const stored = segs.length - (segs.length > 1 && (segs[0] ?? "").trim() === "" ? 1 : 0) - (segs.length > 1 && (segs[segs.length - 1] ?? "").trim() === "" ? 1 : 0);
        let cellPos = rowPos + 1;
        row.forEach((cell, _o, cellIndex) => {
          // End of the cell's paragraph content.
          if (cell.firstChild && cellIndex < stored) targets.push(cellPos + 1 + 1 + cell.firstChild.content.size);
          cellPos += cell.nodeSize;
        });
      }
      rowPos += row.nodeSize;
    });
    return false;
  });
  const lines = text.split("\n");
  for (const target of targets.slice(0, MAX_CELL_EDITS)) {
    stats.cellEdits += 1;
    const edited = serializeVisualDocument(editor.state.tr.insert(target, editor.schema.text(" X")).doc, baseline);
    const out = edited.split("\n");
    if (out.length !== lines.length) return "table_cell_edit_changed_line_count";
    const changed = out.map((line, index) => (line === lines[index] ? -1 : index)).filter((index) => index >= 0);
    if (changed.length !== 1) return "table_cell_edit_changed_other_lines";
    const before = rowSegments(lines[changed[0] as number] ?? "");
    const after = rowSegments(out[changed[0] as number] ?? "");
    if (before.length !== after.length) return "table_cell_edit_changed_cell_count";
    const diff = before.map((seg, index) => (seg === after[index] ? -1 : index)).filter((index) => index >= 0);
    if (diff.length !== 1) return "table_cell_edit_changed_neighbour_cell";
    const k = diff[0] as number;
    if ((after[k] ?? "").trim() !== `${(before[k] ?? "").trim()} X`.trim()) return "table_cell_edit_wrong_cell_bytes";
    const oracle = oracleJudge(blockAround(lines, changed[0] as number), blockAround(out, changed[0] as number), "table_cell_edit");
    if (oracle) return oracle;
  }
  return null;
}

const TABLE_DELIM = /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/;

/** The in-body answer table path on every table in the text's prose blocks. Returns a reason or null. */
function judgeAnswerTables(text: string, stats: SourceStats): string | null {
  let edits = 0;
  for (const block of tokenizeSource(text)) {
    if (block.kind !== "prose") continue;
    const lines = block.raw.split("\n");
    for (let i = 0; i + 1 < lines.length; i += 1) {
      if (!(lines[i] ?? "").includes("|") || !TABLE_DELIM.test(lines[i + 1] ?? "")) continue;
      let end = i + 2;
      while (end < lines.length && (lines[end] ?? "").trim() && (lines[end] ?? "").includes("|")) end += 1;
      const table = lines.slice(i, end).join("\n");
      i = end - 1;
      const grid = parseMarkdownTable(table);
      if (!grid) continue;
      if (rewriteTableSource(table, grid) !== table) return "answer_table_noop_changed_bytes";
      const tableLines = table.split("\n");
      const targets: Array<[number, number]> = [];
      grid.rows.forEach((row, r) => {
        if (r === 0 || row.some((cell) => STRUCTURAL.test(cell))) row.forEach((_cell, c) => targets.push([r, c]));
      });
      for (const [r, c] of targets) {
        if (edits >= MAX_CELL_EDITS) return null;
        edits += 1;
        stats.answerCellEdits += 1;
        const rows = grid.rows.map((row) => [...row]);
        (rows[r] as string[])[c] = `${(rows[r] as string[])[c] ?? ""} X`;
        const out = rewriteTableSource(table, { headers: grid.headers, rows }).split("\n");
        if (out.length !== tableLines.length) return "answer_table_edit_changed_line_count";
        const changed = out.map((line, index) => (line === tableLines[index] ? -1 : index)).filter((index) => index >= 0);
        if (changed.length !== 1) return "answer_table_edit_changed_other_lines";
        const before = rowSegments(tableLines[changed[0] as number] ?? "");
        const after = rowSegments(out[changed[0] as number] ?? "");
        if (before.length !== after.length) return "answer_table_edit_changed_cell_count";
        const diff = before.map((seg, index) => (seg === after[index] ? -1 : index)).filter((index) => index >= 0);
        if (diff.length !== 1) return "answer_table_edit_changed_neighbour_cell";
        const k = diff[0] as number;
        if ((after[k] ?? "").trim() !== `${(before[k] ?? "").trim()} X`.trim()) return "answer_table_edit_wrong_cell_bytes";
        const oracle = oracleJudge(table, out.join("\n"), "answer_table_edit");
        if (oracle) return oracle;
      }
    }
  }
  return null;
}

function tally(json: JSONContent): void {
  const visit = (node: JSONContent) => {
    if (node.type === "sourceLocked") {
      const reason = String(node.attrs?.reason ?? "source");
      lockReasons.set(reason, (lockReasons.get(reason) ?? 0) + 1);
    }
    node.content?.forEach(visit);
  };
  visit(json);
}

/** Every check for one stored text. Returns the failure reason, or null. */
function judge(text: string, stats: SourceStats): string | null {
  const first = buildVisualDocument(text, schema);
  stats.proseBlocks += first.plan.stats.proseBlocks;
  stats.lockedBlocks += first.plan.stats.lockedBlocks;
  stats.lockedChildren += first.plan.stats.lockedChildren;
  stats.editableChildren += first.plan.stats.editableChildren;
  stats.islandBlocks += first.plan.stats.islandBlocks;
  tally(first.json);

  const editor = openEditor(first.json);
  try {
    const baseline = captureBaseline(editor.state.doc, first.plan);
    const visual = serializeVisualDocument(editor.state.doc, baseline);
    if (visual !== text) return "visual_noop_changed_bytes";

    const second = buildVisualDocument(visual, schema);
    const again = openEditor(second.json);
    let switched: string;
    try {
      switched = serializeVisualDocument(again.state.doc, captureBaseline(again.state.doc, second.plan));
    } finally {
      again.destroy();
    }
    if (switched !== text) return "view_switch_changed_bytes";

    const noop = planSave(text, switched);
    if (noop.changed || noop.text !== text || noop.error) return "noop_save_not_identity";

    const tableReason = judgeTableCells(editor, baseline, text, stats);
    if (tableReason) return tableReason;
    const answerReason = judgeAnswerTables(text, stats);
    if (answerReason) return answerReason;

    if (editor.state.doc.childCount >= 3) {
      stats.movedRows += 1;
      const moveReason = judgeMove(editor, baseline, text);
      if (moveReason) return moveReason;
    }

    const target = findEditTarget(editor.state.doc, first.plan);
    if (!target) return null;
    const { pos, offset, blockStart, blockEnd } = target;
    stats.editedRows += 1;
    editor.commands.command(({ tr }) => {
      tr.insert(pos, editor.schema.text(EDIT));
      return true;
    });
    const edited = serializeVisualDocument(editor.state.doc, baseline);
    const tailLength = text.length - blockEnd;
    if (
      edited.slice(0, blockStart) !== text.slice(0, blockStart) ||
      edited.slice(edited.length - tailLength) !== text.slice(blockEnd)
    ) {
      return "edit_changed_bytes_outside_block";
    }
    if (edited !== text.slice(0, offset) + EDIT + text.slice(offset)) {
      return "edit_changed_bytes_inside_block";
    }
    const plan = planSave(text, edited);
    if (plan.error) return "edit_save_refused";
    if (plan.needsConsent.length) return "edit_touched_island";
    const before = islandMultiset(text);
    const after = islandMultiset(edited);
    for (const [key, count] of before) {
      if ((after.get(key) ?? 0) < count) return "edit_lost_island";
    }
    if (countBackslashes(edited) !== countBackslashes(text)) return "edit_added_escape";
    return null;
  } finally {
    editor.destroy();
  }
}

async function main(): Promise<number> {
  installBlockingStdio();
  const env = loadDbEnv();
  if ("missing" in env) {
    console.error(
      `UNMEASURED: no database connection — set ${env.missing.join(", ")} (looked in ${env.looked.join(", ") || "nothing"}).`,
    );
    return 2;
  }
  console.log(`Database connection from ${env.from}; session READ ONLY.`);
  const cx = await connectDirect(env, "rich-editor-roundtrip-corpus");
  await cx.query("set session characteristics as transaction read only");
  await cx.query("set statement_timeout = '120s'");

  const report: Record<string, SourceStats> = {};
  const started = Date.now();
  try {
    for (const source of CORPUS_SOURCES) {
      if (only && only !== source) continue;
      const stats: SourceStats = {
        rows: 0,
        passed: 0,
        editedRows: 0,
        movedRows: 0,
        cellEdits: 0,
        answerCellEdits: 0,
        proseBlocks: 0,
        lockedBlocks: 0,
        lockedChildren: 0,
        editableChildren: 0,
        islandBlocks: 0,
        failures: [],
        slow: [],
      };
      report[source] = stats;
      for await (const row of readCorpusSource(cx, source)) {
        if (stats.rows >= limit) break;
        stats.rows += 1;
        const t0 = Date.now();
        let reason: string | null;
        try {
          reason = judge(row.text, stats);
        } catch (error) {
          reason = `threw:${error instanceof Error ? error.message.slice(0, 80) : "unknown"}`;
        }
        const ms = Date.now() - t0;
        if (ms > SLOW_MS) stats.slow.push({ id: row.id, ms });
        if (reason) stats.failures.push({ id: row.id, reason });
        else stats.passed += 1;
        if (stats.rows % 20000 === 0) console.log(`  ${source}: ${stats.rows} rows…`);
      }
      const editable = stats.editableChildren + stats.lockedChildren;
      console.log(
        `${source.padEnd(18)} rows ${String(stats.rows).padStart(7)}  passed ${String(stats.passed).padStart(7)}  failures ${String(stats.failures.length).padStart(4)}  edited ${stats.editedRows}  moved ${stats.movedRows}  prose blocks ${stats.proseBlocks} (${stats.lockedBlocks} held as source)  constructs ${editable} (${stats.lockedChildren} held as source)  islands ${stats.islandBlocks}`,
      );
    }
  } finally {
    await cx.end();
  }

  const totals = Object.values(report).reduce(
    (acc, s) => ({
      rows: acc.rows + s.rows,
      passed: acc.passed + s.passed,
      edited: acc.edited + s.editedRows,
      moved: acc.moved + s.movedRows,
      cells: acc.cells + s.cellEdits,
      answerCells: acc.answerCells + s.answerCellEdits,
    }),
    { rows: 0, passed: 0, edited: 0, moved: 0, cells: 0, answerCells: 0 },
  );
  const byReason = new Map<string, number>();
  for (const stats of Object.values(report)) {
    for (const failure of stats.failures) {
      byReason.set(failure.reason, (byReason.get(failure.reason) ?? 0) + 1);
    }
  }
  console.log(
    `\nTOTAL rows ${totals.rows}, passed ${totals.passed}, failing ${totals.rows - totals.passed}, edit-checked ${totals.edited}, move-checked ${totals.moved}, table-cell edits ${totals.cells}, answer-table cell edits ${totals.answerCells}  (${Math.round((Date.now() - started) / 1000)}s)`,
  );
  for (const [reason, count] of [...byReason].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${reason}: ${count}`);
  }
  for (const [source, stats] of Object.entries(report)) {
    for (const failure of stats.failures.slice(0, 200)) {
      console.log(`  FAIL ${source} ${failure.id} ${failure.reason}`);
    }
    for (const slow of stats.slow.slice(0, 50)) console.log(`  SLOW ${source} ${slow.id} ${slow.ms}ms`);
  }
  console.log("\nHeld as source (shown rendered, edited as source, written back verbatim):");
  for (const [reason, count] of [...lockReasons].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${reason}: ${count}`);
  }
  if (jsonOut) {
    writeFileSync(
      jsonOut,
      JSON.stringify(
        { at: new Date().toISOString(), totals, report, lockReasons: Object.fromEntries(lockReasons) },
        null,
        2,
      ),
    );
    console.log(`Report written to ${jsonOut}`);
  }
  return totals.rows === totals.passed ? 0 : 1;
}

main()
  .then((code) => exitAfterDrain(code))
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    exitAfterDrain(2);
  });
