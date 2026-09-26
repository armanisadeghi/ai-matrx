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
