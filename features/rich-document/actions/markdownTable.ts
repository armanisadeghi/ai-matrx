import { unwrapCodeSpans } from "@/lib/markdown/code-ranges";
import {
  findTableEnd,
  rowCells,
  tableStartsAt,
  unescapeCellPipes,
} from "@/components/mardown-display/markdown-classification/processors/utils/gfm-table-lines";
// features/rich-document/actions/markdownTable.ts
//
// The first GitHub-flavoured markdown table in a piece of content, as plain
// headers + rows — what "copy table as CSV/TSV" and "save table as data" act
// on. Cells keep their text; inline markdown is stripped so a spreadsheet
// reads normal values.

export interface ParsedTable {
  headers: string[];
  rows: string[][];
}

/** A row's cells by THE GFM rule (gfm-table-lines): `\|` stays in its cell and reads as `|`. */
function splitRow(line: string): string[] {
  return rowCells(line).map((cell) => cleanCell(unescapeCellPipes(cell)));
}

export function cleanCell(text: string): string {
  return unwrapCodeSpans(text)
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/~~([^~]+)~~/g, "$1")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1")
    .replace(/<br\s*\/?>/gi, " ")
    .trim();
}

/** The first markdown table in `content`, or null when there is none. */
export function parseFirstMarkdownTable(content: string): ParsedTable | null {
  const lines = content.split("\n");
  for (let i = 0; i + 1 < lines.length; i += 1) {
    // THE table rule: a header (edge pipes optional) over its delimiter row.
    if (!tableStartsAt(lines, i)) continue;
    const headers = splitRow(lines[i]);
    const rows: string[][] = [];
    const end = findTableEnd(lines, i);
    for (let j = i + 2; j < end; j += 1) {
      const cells = splitRow(lines[j]);
      // Pad / trim to the header width so every row is rectangular.
      rows.push(headers.map((_, k) => cells[k] ?? ""));
    }
    return { headers, rows };
  }
  return null;
}

/** RFC 4180 CSV (comma) or TSV (tab) text for a parsed table. */
export function tableToDelimited(
  table: ParsedTable,
  delimiter: "," | "\t",
): string {
  const escape = (value: string) => {
    if (delimiter === "\t") return value.replace(/[\t\r\n]+/g, " ");
    return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
  };
  return [table.headers, ...table.rows]
    .map((row) => row.map(escape).join(delimiter))
    .join("\n");
}
