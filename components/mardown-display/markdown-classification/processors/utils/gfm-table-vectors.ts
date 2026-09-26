/**
 * THE TypeScript rule run over the shared inputs — what the vectors JSON holds.
 * The drift test both writes (GFM_TABLE_VECTORS_WRITE=1) and checks the JSON with it.
 */
import { rowCells } from "@/components/rich-editor/core/table-source";
import { unescapeCellPipes } from "@/components/markdown-core/syntax/gfm-cell-pipes";
import { parseMarkdownTable } from "@/components/mardown-display/blocks/table/parseMarkdownTable";
import { splitContentIntoBlocksV2 } from "./content-splitter-v2";
import { CELL_INPUTS, DOCUMENT_INPUTS, ROW_INPUTS, TABLE_INPUTS } from "./gfm-table-vector-inputs";

export interface GfmTableVectors {
  rows: Array<{ line: string; cells: string[] }>;
  cellPipes: Array<{ cell: string; display: string }>;
  tables: Array<{ table: string; headers: string[]; rows: string[][] } | { table: string; notATable: true }>;
  documents: Array<{ name: string; text: string; blocks: Array<[string, string]> }>;
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
  };
}
