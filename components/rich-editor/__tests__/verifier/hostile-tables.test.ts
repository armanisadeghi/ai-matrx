/**
 * The RC-B4 round-4 verifier's hostile-table harness as a permanent test
 * (original, verbatim: ./harness-rcb4-round4.ts).
 *
 * SUT: both table edit paths — the rich editor (buildVisualDocument → a real
 * ProseMirror transaction → serializeVisualDocument) and the in-body answer
 * table editors (parseMarkdownTable → edit → rewriteTableSource).
 * Judge: an INDEPENDENT GFM parser (micromark via remark-gfm,
 * scripts/lib/gfm-table-oracle.ts) — never the splitter under test. For every
 * cell of 11 hostile tables and each edit kind:
 *   · only the edited row's line changes;
 *   · every other cell reads back exactly as before (displayed text);
 *   · the edited cell displays what the person typed;
 *   · or the writer REFUSES (TableWriteRefused) — never a silent wrong table.
 */
import { Editor, getSchema, type JSONContent } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";
import type { Transaction } from "@tiptap/pm/state";
import { createRichEditorExtensions } from "../../core/extensions";
import { buildVisualDocument, captureBaseline, serializeVisualDocument } from "../../core/visual-document";
import { rewriteTableSource, TableWriteRefused } from "../../core/table-source";
import { parseMarkdownTable } from "@/components/mardown-display/blocks/table/parseMarkdownTable";
import { oracleTableText } from "@/scripts/lib/gfm-table-oracle";

const extensions = createRichEditorExtensions();
const schema = getSchema(extensions);

/** The verifier's 11 hostile tables (a dock/warehouse handoff sheet in each shape). */
const TABLES: Record<string, string> = {
  escPipeSibling: "| Dock | Rule |\n|---|---|\n| D1 | open for A \\| B carriers only |\n| D2 | closed |",
  codePipe: "| Cmd | Note |\n|:--|--:|\n| `grep a\\|b` | alt \\| pipe |\n| `ls` | n/a |",
  dblBackslashPipe: "| Share | Path | Owner |\n|---|---|---|\n| ops |\\\\srv\\\\ops\\\\| Dana |\n| fin | x | Luis |",
  compact: "|Item|Qty|Note|\n|-|-|-|\n|Bolts|12|ok|\n|Nuts||n/a|",
  ragged: "| A | B | C |\n|---|---|---|\n| 1 | 2 |\n| 4 | 5 | 6 | 7 |",
  wide: "| 名前 | 状態 | 備考 |\n|:---:|:---|---:|\n| 東京倉庫 | ✅ 稼働 | 👍🏽 良好 |\n| 大阪 | ⚠️ | — |",
  mathLink: "| Metric | Formula | Ref |\n|---|---|---|\n| Fill | $\\frac{a}{b}$ | [spec](https://ex.com/a_b) |\n| Margin | $x \\cdot y$ | <kbd>Ctrl</kbd> |",
  bold: "| Status | Owner |\n|---|---|\n| **fail** | _Dana_ |\n| __ok__ | *Luis* |",
  nolead: "Dock | Rule\n--- | ---\nD1 | open for A \\| B\nD2 | closed",
  handoverOrder: "Step | Task | Who\n--- | --- | ---\n1 | Swap the label printer | Ines\n2 | Re-scan bay B3 | Omar",
  emptyCells: "| A | B | C |\n|---|---|---|\n|  | x |  |\n| y |  | z |",
  trailingBackslashCompact: "|Path|Owner|\n|---|---|\n|C:\\temp|Dana|\n|D:|Luis|",
};

type Edit = { label: string; typed: (old: string) => string; displayed: (oldDisplayed: string) => string };
/** Edit kinds whose displayed result does not depend on markdown (an answer cell IS markdown source). */
const EDITS: Edit[] = [
  { label: "append", typed: (s) => `${s} X`, displayed: (d) => `${d} X`.trim() },
  { label: "prepend", typed: (s) => `X ${s}`, displayed: (d) => `X ${d}`.trim() },
  { label: "replace", typed: () => "Replaced", displayed: () => "Replaced" },
  { label: "clear", typed: () => "", displayed: () => "" },
  { label: "trailBackslash", typed: () => "C:\\new\\", displayed: () => "C:\\new\\" },
  { label: "pipeTyped", typed: () => "a | b", displayed: () => "a | b" },
  // Round 5: a cell that starts like block syntax must never end a pipe-less table.
  { label: "bulletTyped", typed: () => "- n/a", displayed: () => "- n/a" },
  { label: "quoteTyped", typed: () => "> 90%", displayed: () => "> 90%" },
  { label: "headingTyped", typed: () => "# 3", displayed: () => "# 3" },
  { label: "orderedTyped", typed: () => "1. first", displayed: () => "1. first" },
];

interface Outcome {
  failures: string[];
  refusals: number;
  checks: number;
}

/** Judge one written table against the original by the oracle's displayed text. */
function judge(
  where: string,
  before: string,
  after: string,
  r: number,
  c: number,
  expected: string,
  compareEdited: boolean,
  out: Outcome,
): void {
  out.checks += 1;
  const g0 = oracleTableText(before);
  const g1 = oracleTableText(after);
  if (!g0) return;
  if (!g1) {
    out.failures.push(`${where} r${r}c${c}: no table after the edit\n${after}`);
    return;
  }
  const bl = before.split("\n");
  const al = after.split("\n");
  const rowLine = r === 0 ? 0 : r + 1;
  if (bl.length !== al.length || bl.some((line, i) => i !== rowLine && line !== al[i])) {
    out.failures.push(`${where} r${r}c${c}: lines other than the edited row changed\n${after}`);
    return;
  }
  for (let i = 0; i < g0.length; i += 1) {
    for (let j = 0; j < (g0[0]?.length ?? 0); j += 1) {
      const want = i === r && j === c ? expected : (g0[i]?.[j] ?? "");
      const got = g1[i]?.[j] ?? "";
      if (i === r && j === c && !compareEdited) continue;
      if (want !== got) {
        out.failures.push(`${where} r${r}c${c}: cell r${i}c${j} want ${JSON.stringify(want)} got ${JSON.stringify(got)}\n${after}`);
        return;
      }
    }
  }
}

function answerPath(name: string, table: string, out: Outcome): void {
  const grid = parseMarkdownTable(table);
  if (!grid) {
    out.failures.push(`answer ${name}: the ONE parser reads no table`);
    return;
  }
  expect(rewriteTableSource(table, grid)).toBe(table);
  const shown = oracleTableText(table) ?? [];
  const width = grid.headers.length;
  for (let r = 0; r <= grid.rows.length; r += 1) {
    for (let c = 0; c < width; c += 1) {
      for (const edit of EDITS) {
        const headers = [...grid.headers];
        const rows = grid.rows.map((row) => [...row]);
        if (r === 0) headers[c] = edit.typed(headers[c] ?? "");
        else {
          const row = rows[r - 1] as string[];
          while (row.length <= c) row.push("");
          row[c] = edit.typed(row[c] ?? "");
        }
        let written: string;
        try {
          written = rewriteTableSource(table, { headers, rows });
        } catch (error) {
          if (error instanceof TableWriteRefused) {
            out.refusals += 1;
            continue;
          }
          throw error;
        }
        // Appending to a cell with markup: its displayed text is not predictable
        // from the old displayed text alone — judge the neighbours only.
        const plainOld = /^[\w .,/:-]*$/.test(r === 0 ? (grid.headers[c] ?? "") : (grid.rows[r - 1]?.[c] ?? ""));
        const predictable = !["append", "prepend"].includes(edit.label) || plainOld;
        judge(`answer ${name} ${edit.label}`, table, written, r, c, edit.displayed(shown[r]?.[c] ?? ""), predictable, out);
      }
    }
  }
}

function cellRanges(doc: PMNode): Array<{ r: number; c: number; from: number; to: number }> {
  const ranges: Array<{ r: number; c: number; from: number; to: number }> = [];
  doc.descendants((node, pos) => {
    if (node.type.name !== "table") return true;
    let rowPos = pos + 1;
    node.forEach((row, _o, r) => {
      let cellPos = rowPos + 1;
      row.forEach((cell, _o2, c) => {
        const from = cellPos + 2;
        ranges.push({ r, c, from, to: from + (cell.firstChild?.content.size ?? 0) });
        cellPos += cell.nodeSize;
      });
      rowPos += row.nodeSize;
    });
    return false;
  });
  return ranges;
}

function visualPath(name: string, table: string, out: Outcome): void {
  const text = `# Handoff\n\n${table}\n\nAfter.\n`;
  const load = buildVisualDocument(text, schema);
  const editor = new Editor({ element: null, extensions, content: load.json as JSONContent });
  try {
    const baseline = captureBaseline(editor.state.doc, load.plan);
    expect(serializeVisualDocument(editor.state.doc, baseline)).toBe(text);
    const shown = oracleTableText(table) ?? [];
    const width = shown[0]?.length ?? 0;
    for (const cell of cellRanges(editor.state.doc)) {
      if (cell.c >= width) continue;
      const kinds: Array<[string, string, (tr: Transaction) => Transaction]> = [
        ["append", `${shown[cell.r]?.[cell.c] ?? ""} X`.trim(), (tr) => tr.insertText(" X", cell.to)],
        ["prepend", `X ${shown[cell.r]?.[cell.c] ?? ""}`.trim(), (tr) => tr.insertText("X ", cell.from)],
        ["replace", "Replaced", (tr) => tr.insertText("Replaced", cell.from, cell.to)],
        ["pipeTyped", "a | b", (tr) => tr.insertText("a | b", cell.from, cell.to)],
        ["trailBackslash", "C:\\new\\", (tr) => tr.insertText("C:\\new\\", cell.from, cell.to)],
        ["bulletTyped", "- n/a", (tr) => tr.insertText("- n/a", cell.from, cell.to)],
        ["quoteTyped", "> 90%", (tr) => tr.insertText("> 90%", cell.from, cell.to)],
        ["headingTyped", "# 3", (tr) => tr.insertText("# 3", cell.from, cell.to)],
        ["orderedTyped", "1. first", (tr) => tr.insertText("1. first", cell.from, cell.to)],
      ];
      if (cell.to > cell.from) kinds.push(["clear", "", (tr) => tr.delete(cell.from, cell.to)]);
      for (const [label, expected, apply] of kinds) {
        let written: string;
        try {
          written = serializeVisualDocument(apply(editor.state.tr).doc, baseline);
        } catch (error) {
          if (error instanceof TableWriteRefused) {
            out.refusals += 1;
            continue;
          }
          throw error;
        }
        if (!written.startsWith("# Handoff\n\n") || !written.endsWith("\n\nAfter.\n")) {
          out.failures.push(`visual ${name} ${label} r${cell.r}c${cell.c}: bytes outside the table changed`);
          continue;
        }
        const after = written.slice("# Handoff\n\n".length, written.length - "\n\nAfter.\n".length);
        const plainOld = /^[\w .,/:-]*$/.test(shown[cell.r]?.[cell.c] ?? "");
        judge(`visual ${name} ${label}`, table, after, cell.r, cell.c, expected, !["append", "prepend"].includes(label) || plainOld, out);
      }
    }
  } finally {
    editor.destroy();
  }
}

describe("the verifier's hostile tables: every edit keeps every other cell, judged by an independent GFM parser", () => {
  for (const [name, table] of Object.entries(TABLES)) {
    it(`answer tables — ${name}`, () => {
      const out: Outcome = { failures: [], refusals: 0, checks: 0 };
      answerPath(name, table, out);
      expect(out.failures).toEqual([]);
      expect(out.checks + out.refusals).toBeGreaterThan(0);
    });
    it(`rich editor — ${name}`, () => {
      const out: Outcome = { failures: [], refusals: 0, checks: 0 };
      visualPath(name, table, out);
      expect(out.failures).toEqual([]);
    });
  }
});
