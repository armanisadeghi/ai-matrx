/**
 * AN INDEPENDENT GFM TABLE ORACLE — micromark (remark-parse + remark-gfm), a
 * spec-following GFM parser that shares no code with the editor's table
 * splitter (components/rich-editor/core/table-source.ts) or its marked lexer.
 * Tests and the editor corpus gate judge table edits against THIS, never
 * against the splitter under test (verify-RC-B4 R4: a gate that judged with the
 * same splitter passed a writer that merged neighbour cells).
 *
 * Returns the table's grid as each cell's SOURCE text (the bytes between its
 * pipes, trimmed — escapes kept), header first; null when the text holds no table.
 */
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";

interface Positioned {
  type: string;
  value?: string;
  children?: Positioned[];
  position?: { start: { offset?: number }; end: { offset?: number } };
}

const processor = unified().use(remarkParse).use(remarkGfm);

export function oracleTableGrids(markdown: string): string[][][] {
  const tree = processor.parse(markdown) as unknown as Positioned;
  const grids: string[][][] = [];
  const visit = (node: Positioned) => {
    if (node.type === "table") {
      grids.push(
        (node.children ?? []).map((row) =>
          (row.children ?? []).map((cell) => {
            const kids = cell.children ?? [];
            const first = kids[0]?.position?.start.offset;
            const last = kids[kids.length - 1]?.position?.end.offset;
            return first === undefined || last === undefined ? "" : markdown.slice(first, last).trim();
          }),
        ),
      );
      return;
    }
    for (const child of node.children ?? []) visit(child);
  };
  visit(tree);
  return grids;
}

export function oracleTableGrid(markdown: string): string[][] | null {
  return oracleTableGrids(markdown)[0] ?? null;
}

/** A node's displayed text: text/code values concatenated (what a reader sees, markup gone). */
function displayed(node: Positioned): string {
  if (typeof node.value === "string" && node.type !== "html") return node.value;
  return (node.children ?? []).map(displayed).join("");
}

/**
 * The first table's grid as DISPLAYED text (escapes resolved, emphasis/code
 * markers gone) — what a reader of the rendered table sees in each cell.
 * Short rows are padded with "" to the header width, as GFM displays them.
 */
export function oracleTableText(markdown: string): string[][] | null {
  const tree = processor.parse(markdown) as unknown as Positioned;
  let table: Positioned | null = null;
  const find = (node: Positioned) => {
    if (table) return;
    if (node.type === "table") table = node;
    else for (const child of node.children ?? []) find(child);
  };
  find(tree);
  if (!table) return null;
  const rows = ((table as Positioned).children ?? []).map((row) => (row.children ?? []).map((cell) => displayed(cell).trim()));
  const width = rows[0]?.length ?? 0;
  return rows.map((row) => Array.from({ length: width }, (_v, i) => row[i] ?? ""));
}
