/**
 * THE TypeScript rule run over the shared inputs — what the vectors JSON holds.
 * The drift test both writes (GFM_TABLE_VECTORS_WRITE=1) and checks the JSON with it.
 */
import { rowCells } from "@/components/rich-editor/core/table-source";
import { unescapeCellPipes } from "@/components/markdown-core/syntax/gfm-cell-pipes";
import { parseMarkdownTable } from "@/components/mardown-display/blocks/table/parseMarkdownTable";
import { splitContentIntoBlocksV2 } from "./content-splitter-v2";
import { findTableEnd, tableStartsAt } from "./gfm-table-lines";
import { CELL_INPUTS, DOCUMENT_INPUTS, ROW_INPUTS, TABLE_END_INPUTS, TABLE_INPUTS, TABLE_START_INPUTS } from "./gfm-table-vector-inputs";

export interface GfmTableVectors {
  rows: Array<{ line: string; cells: string[] }>;
  cellPipes: Array<{ cell: string; display: string }>;
  tables: Array<{ table: string; headers: string[]; rows: string[][] } | { table: string; notATable: true }>;
  documents: Array<{ name: string; text: string; blocks: Array<[string, string]> }>;
  /** Where a table that opens at `start` ends (index just past its last row). */
  tableEnds: Array<{ lines: string[]; start: number; end: number }>;
  /** Whether a table opens at the candidate header (the third line from the end). */
  tableStarts: Array<{ lines: string[]; index: number; opens: boolean }>;
}

export function computeGfmTableVectors(): GfmTableVectors {
  return {
    rows: ROW_INPUTS.map((line) => ({ line, cells: rowCells(line) })),
    cellPipes: CELL_INPUTS.map((cell) => ({ cell, display: unescapeCellPipes(cell) })),
    tables: TABLE_INPUTS.map((table) => {
      const parsed = parseMarkdownTable(table);
      return parsed ? { table, headers: parsed.headers, rows: parsed.rows } : { table, notATable: true as const };
    }),
    documents: DOCUMENT_INPUTS.map(({ name, text }) => ({
      name,
      text,
      blocks: splitContentIntoBlocksV2(text)
        .filter((block) => block.content.trim())
        .map((block) => [block.type, block.content.trim()] as [string, string]),
    })),
    tableEnds: TABLE_END_INPUTS.map(({ lines, start }) => ({ lines: [...lines], start, end: findTableEnd(lines, start) })),
    tableStarts: TABLE_START_INPUTS.map((lines) => ({ lines: [...lines], index: lines.length - 3, opens: tableStartsAt(lines, lines.length - 3) })),
  };
}
