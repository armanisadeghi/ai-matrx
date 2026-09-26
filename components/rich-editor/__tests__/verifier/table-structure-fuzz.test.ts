/**
 * The RC-B4 round-6 verifier's structural table fuzz as a permanent test
 * (original, verbatim: ./fuzz-structure-rcb4-round6.ts).
 *
 * SUT: the in-body answer table path (parseMarkdownTable → edit → rewriteTableSource)
 * and the rich editor (buildVisualDocument → real ProseMirror transaction →
 * serializeVisualDocument).
 * Judge: the INDEPENDENT GFM oracle (micromark via remark-gfm), never the splitter.
 * Seeded random edits — cell text with block starters (-, >, #, 1.), backslashes,
 * pipes, backticks, HTML, fences, tabs, lone carriage returns — plus added rows,
 * removed rows and added columns, over five table shapes (piped, compact,
 * pipe-less, code/escape, header-only). Every write must either:
 *   · read back as exactly ONE table with the intended row count, or
 *   · be REFUSED (TableWriteRefused) — never a silently broken table.
 * Round 6 found the only refusals come from a lone "\r" in a cell (freshCell
 * flattens "\n" and "\r\n", not a bare "\r"); the refusal is the honest outcome.
 */
import { Editor, getSchema } from "@tiptap/core";
import { createRichEditorExtensions } from "../../core/extensions";
import { buildVisualDocument, captureBaseline, serializeVisualDocument } from "../../core/visual-document";
import { rewriteTableSource, TableWriteRefused } from "../../core/table-source";
import { parseMarkdownTable } from "@/components/mardown-display/blocks/table/parseMarkdownTable";
import { oracleTableGrids } from "@/scripts/lib/gfm-table-oracle";

const ALPHA = ["a", " ", "\\", "|", "`", "``", "*", "-", ">", "#", "1.", "<!--", "```", "~~~", "\t", " ", "&#124;", "\r", "\n", "<div>", "===", "---", ":", "[^1]", "$"];

const TABLES = [
  "| A | B | C |\n|---|---|---|\n| 1 | 2 | 3 |\n| 4 | 5 | 6 |",
  "|A|B|C|\n|-|-|-|\n|1|2|3|\n|4||6|",
  "A | B | C\n--- | --- | ---\n1 | 2 | 3\n4 | 5 | 6",
  "| A | B |\n|:--|--:|\n| `x\\|y` | a \\\\| \n| c | d |",
  "| A | B |\n|---|---|",
];

function seeded(seed: number) {
  let s = seed;
  return () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648;
}

/** Exactly one table, judged by micromark; its body-row count. Null when not exactly one. */
function oneTableRows(markdown: string): number | null {
  const grids = oracleTableGrids(markdown);
  return grids.length === 1 ? (grids[0]?.length ?? 1) - 1 : null;
}

describe("round 6: structural fuzz — one table or an honest refusal (oracle: micromark)", () => {
  it("answer-table writer: 4,000 seeded cell/row/column edits", () => {
    const rnd = seeded(99);
    const rstr = () => {
      let v = "";
      const len = Math.floor(rnd() * 5);
      for (let k = 0; k < len; k += 1) v += ALPHA[Math.floor(rnd() * ALPHA.length)];
      return v;
    };
    const broken: string[] = [];
    let written = 0;
    for (let it = 0; it < 4000; it += 1) {
      const table = TABLES[it % TABLES.length] as string;
      const grid = parseMarkdownTable(table);
      if (!grid) continue;
      const headers = [...grid.headers];
      const rows = grid.rows.map((row) => [...row]);
      const op = rnd();
      if (op < 0.6) {
        const r = Math.floor(rnd() * (rows.length + 1));
        const c = Math.floor(rnd() * headers.length);
        const v = rstr();
        if (r === 0) headers[c] = v;
        else (rows[r - 1] as string[])[c] = v;
      } else if (op < 0.8) {
        rows.splice(Math.floor(rnd() * (rows.length + 1)), 0, headers.map(() => rstr()));
      } else if (op < 0.9 && rows.length) {
        rows.splice(Math.floor(rnd() * rows.length), 1);
      } else {
        headers.push(rstr() || "New");
        rows.forEach((row) => row.push(rstr()));
      }
      let out: string;
      try {
        out = rewriteTableSource(table, { headers, rows });
      } catch (error) {
        if (error instanceof TableWriteRefused) continue;
        throw error;
      }
      written += 1;
      const count = oneTableRows(out);
      if (count !== rows.length && broken.length < 5) broken.push(`${JSON.stringify({ headers, rows })}\n→\n${out}`);
    }
    expect(written).toBeGreaterThan(3000);
    expect(broken).toEqual([]);
  });

  it("rich editor: 400 seeded cell edits on a document with a pipe-less table", () => {
    const extensions = createRichEditorExtensions();
    const schema = getSchema(extensions);
    const text =
      "# Receiving\n\n| Trailer | Owner |\n|:--|--:|\n| T1 | Priya |\n\nThreshold | Action | Who\n--- | --- | ---\n1 | Log the reading | Tom\n2 | Call the carrier | Ines\n\nEnd.\n";
    const load = buildVisualDocument(text, schema);
    const editor = new Editor({ element: null as unknown as HTMLElement, extensions, content: load.json });
    try {
      const baseline = captureBaseline(editor.state.doc, load.plan);
      const cells: Array<{ from: number; to: number }> = [];
      editor.state.doc.descendants((node, pos) => {
        if (node.type.name === "tableCell" || node.type.name === "tableHeader") {
          const from = pos + 2;
          cells.push({ from, to: from + (node.firstChild?.content.size ?? 0) });
        }
        return true;
      });
      expect(cells.length).toBeGreaterThan(0);
      const before = oracleTableGrids(text).map((grid) => grid.length).join();
      const rnd = seeded(11);
      const alpha = ALPHA.filter((a) => a !== "\r" && a !== "\n");
      const broken: string[] = [];
      for (let i = 0; i < 400; i += 1) {
        const cell = cells[Math.floor(rnd() * cells.length)] as { from: number; to: number };
        let v = "";
        const len = 1 + Math.floor(rnd() * 5);
        for (let k = 0; k < len; k += 1) v += alpha[Math.floor(rnd() * alpha.length)];
        const tr = rnd() < 0.5 ? editor.state.tr.insertText(v, cell.to) : editor.state.tr.insertText(v, cell.from, cell.to);
        let out: string;
        try {
          out = serializeVisualDocument(tr.doc, baseline);
        } catch (error) {
          if (error instanceof TableWriteRefused) continue;
          throw error;
        }
        const after = oracleTableGrids(out).map((grid) => grid.length).join();
        if (after !== before && broken.length < 5) broken.push(`${JSON.stringify(v)}: ${before} → ${after}\n${out}`);
      }
      expect(broken).toEqual([]);
    } finally {
      editor.destroy();
    }
  });
});
