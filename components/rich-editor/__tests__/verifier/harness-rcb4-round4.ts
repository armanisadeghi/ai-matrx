// Zero-authorship verifier harness for RC-B4 round 4 — hostile tables through the two table edit paths.
import { Editor, getSchema } from "@tiptap/core";
import { marked } from "marked";
import { createRichEditorExtensions } from "/Users/armanisadeghi/code/matrx-frontend/components/rich-editor/core/extensions";
import { buildVisualDocument, captureBaseline, serializeVisualDocument } from "/Users/armanisadeghi/code/matrx-frontend/components/rich-editor/core/visual-document";
import { rewriteTableSource } from "/Users/armanisadeghi/code/matrx-frontend/components/rich-editor/core/table-source";
import { parseMarkdownTable } from "/Users/armanisadeghi/code/matrx-frontend/components/mardown-display/blocks/table/parseMarkdownTable";

const extensions = createRichEditorExtensions();
const schema = getSchema(extensions);

type Grid = string[][];
function gfmGrid(md: string): Grid | null {
  const t = marked.lexer(md, { gfm: true }).find((tok) => tok.type === "table") as any;
  if (!t) return null;
  return [t.header.map((c: any) => c.text), ...t.rows.map((r: any[]) => r.map((c) => c.text))];
}

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
  emptyCells: "| A | B | C |\n|---|---|---|\n|  | x |  |\n| y |  | z |",
  trailingBackslashCompact: "|Path|Owner|\n|---|---|\n|C:\\temp|Dana|\n|D:|Luis|",
};

// Edit kinds: [label, fn(old)->new]
const EDITS: Array<[string, (s: string) => string]> = [
  ["append", (s) => s + " X"],
  ["prepend", (s) => "X " + s],
  ["replace", () => "Replaced"],
  ["clear", () => ""],
  ["trailBackslash", () => "C:\\new\\"],
  ["pipeTyped", () => "a | b"],
  ["starTyped", () => "*literal*"],
];

let fails = 0;
let checks = 0;
function report(path: string, name: string, r: number, c: number, edit: string, why: string, out?: string) {
  fails += 1;
  console.log(`FAIL [${path}] ${name} r${r}c${c} ${edit}: ${why}${out ? `\n----\n${out}\n----` : ""}`);
}

function judge(path: string, name: string, before: string, after: string, r: number, c: number, edit: string, expected: string) {
  checks += 1;
  const g0 = gfmGrid(before)!;
  const g1 = gfmGrid(after);
  if (!g1) return report(path, name, r, c, edit, "no table after", after);
  const bl = before.split("\n"), al = after.split("\n");
  if (bl.length !== al.length) return report(path, name, r, c, edit, "line count changed", after);
  const changed = bl.map((l, i) => (l === al[i] ? -1 : i)).filter((i) => i >= 0);
  const rowLine = r === 0 ? 0 : r + 1;
  if (changed.some((i) => i !== rowLine)) return report(path, name, r, c, edit, `other lines changed ${changed}`, after);
  for (let i = 0; i < g0.length; i++) {
    for (let j = 0; j < g0[0]!.length; j++) {
      const want = i === r && j === c ? expected : g0[i]![j] ?? "";
      const got = g1[i]?.[j] ?? "";
      if (want !== got) return report(path, name, r, c, edit, `cell r${i}c${j} want ${JSON.stringify(want)} got ${JSON.stringify(got)}`, after);
    }
  }
}

// Answer-table path
for (const [name, table] of Object.entries(TABLES)) {
  const grid = parseMarkdownTable(table);
  if (!grid) { console.log(`skip answer ${name}: not parsed`); continue; }
  if (rewriteTableSource(table, grid) !== table) report("answer", name, -1, -1, "noop", "noop changed bytes", rewriteTableSource(table, grid));
  const g0 = gfmGrid(table)!;
  // check parser agrees with GFM
  const pg = [grid.headers, ...grid.rows];
  if (JSON.stringify(pg.map((r) => r.slice(0, g0[0]!.length))) !== JSON.stringify(g0.map((r, i) => r.slice(0, pg[i]?.length ?? 0))))
    console.log(`NOTE answer ${name}: parser grid ${JSON.stringify(pg)} vs GFM ${JSON.stringify(g0)}`);
  for (let r = 0; r <= grid.rows.length; r++) {
    for (let c = 0; c < grid.headers.length; c++) {
      for (const [label, fn] of EDITS) {
        const headers = [...grid.headers];
        const rows = grid.rows.map((x) => [...x]);
        const cur = r === 0 ? headers[c]! : rows[r - 1]![c] ?? "";
        const nv = fn(cur);
        if (r === 0) headers[c] = nv; else { while (rows[r - 1]!.length <= c) rows[r - 1]!.push(""); rows[r - 1]![c] = nv; }
        const out = rewriteTableSource(table, { headers, rows });
        // expected GFM cell text: what the person typed, as displayed
        judge("answer", name, table, out, r, c, label, nv.trim().replace(/\\\|/g, "|"));
      }
    }
  }
}

// Visual path (rich editor)
function cellPositions(doc: any): Array<{ r: number; c: number; from: number; to: number }> {
  const out: any[] = [];
  doc.descendants((node: any, pos: number) => {
    if (node.type.name !== "table") return true;
    let rowPos = pos + 1;
    node.forEach((row: any, _o: number, r: number) => {
      let cellPos = rowPos + 1;
      row.forEach((cell: any, _o2: number, c: number) => {
        const from = cellPos + 2; // cell open + paragraph open
        out.push({ r, c, from, to: from + (cell.firstChild?.content.size ?? 0) });
        cellPos += cell.nodeSize;
      });
      rowPos += row.nodeSize;
    });
    return false;
  });
  return out;
}

for (const [name, table] of Object.entries(TABLES)) {
  const text = `# Handoff\n\n${table}\n\nAfter.\n`;
  const load = buildVisualDocument(text, schema);
  const editor = new Editor({ element: null as any, extensions, content: load.json });
  const baseline = captureBaseline(editor.state.doc, load.plan);
  const noop = serializeVisualDocument(editor.state.doc, baseline);
  if (noop !== text) report("visual", name, -1, -1, "noop", "noop changed", noop);
  const cells = cellPositions(editor.state.doc);
  if (!cells.length) { console.log(`skip visual ${name}: table locked/not editable`); editor.destroy(); continue; }
  const g0 = gfmGrid(table)!;
  for (const cell of cells) {
    if (cell.c >= g0[0]!.length) continue;
    const curText = editor.state.doc.textBetween(cell.from, cell.to);
    const plain: Array<[string, string, (tr: any) => any]> = [
      ["append", " X", (tr) => tr.insertText(" X", cell.to)],
      ["prepend", "X ", (tr) => tr.insertText("X ", cell.from)],
      ["replace", "Replaced", (tr) => tr.insertText("Replaced", cell.from, cell.to)],
      ["pipeTyped", "a | b", (tr) => tr.insertText("a | b", cell.from, cell.to)],
      ["trailBackslash", "C:\\new\\", (tr) => tr.insertText("C:\\new\\", cell.from, cell.to)],
    ];
    if (cell.to > cell.from) plain.push(["clear", "", (tr) => tr.delete(cell.from, cell.to)]);
    for (const [label, _t, fn] of plain) {
      const tr = fn(editor.state.tr);
      const out = serializeVisualDocument(tr.doc, baseline);
      const outTable = out.slice(out.indexOf(table.split("\n")[0]!.slice(0, 3)));
      const o = out.split("\n\n")[1] ?? "";
      const g1 = gfmGrid(o);
      const origCell = g0[cell.r]![cell.c]!;
      // expected: only for plain-text cells can we predict; otherwise check neighbours only
      let expected: string;
      if (label === "replace") expected = "Replaced";
      else if (label === "clear") expected = "";
      else if (label === "pipeTyped") expected = "a | b";
      else if (label === "trailBackslash") expected = "C:\\new\\";
      else expected = (label === "append" ? origCell + " X" : "X " + origCell).trim();
      checks += 1;
      if (!out.startsWith("# Handoff\n\n") || !out.endsWith("\n\nAfter.\n")) { report("visual", name, cell.r, cell.c, label, "outside table changed", out); continue; }
      const bl = table.split("\n"), al = o.split("\n");
      if (bl.length !== al.length) { report("visual", name, cell.r, cell.c, label, "line count", o); continue; }
      const rowLine = cell.r === 0 ? 0 : cell.r + 1;
      const changed = bl.map((l, i) => (l === al[i] ? -1 : i)).filter((i) => i >= 0);
      if (changed.some((i) => i !== rowLine)) { report("visual", name, cell.r, cell.c, label, `other lines ${changed}`, o); continue; }
      if (!g1) { report("visual", name, cell.r, cell.c, label, "no table", o); continue; }
      let bad = "";
      for (let i = 0; i < g0.length && !bad; i++) for (let j = 0; j < g0[0]!.length; j++) {
        if (i === cell.r && j === cell.c) continue;
        if ((g0[i]![j] ?? "") !== (g1[i]?.[j] ?? "")) { bad = `neighbour r${i}c${j} ${JSON.stringify(g0[i]![j])} -> ${JSON.stringify(g1[i]?.[j])}`; break; }
      }
      const simple = /^[\w .,\/-]*$/.test(origCell) || label === "replace" || label === "clear" || label === "pipeTyped" || label === "trailBackslash";
      const got = g1[cell.r]?.[cell.c] ?? "";
      if (!bad && simple && got !== expected) bad = `edited cell want ${JSON.stringify(expected)} got ${JSON.stringify(got)} (visual text ${JSON.stringify(curText)})`;
      if (bad) report("visual", name, cell.r, cell.c, label, bad, o);
      void outTable;
    }
  }
  editor.destroy();
}
console.log(`checks=${checks} fails=${fails}`);
