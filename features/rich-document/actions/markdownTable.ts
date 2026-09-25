import { unwrapCodeSpans } from "@/lib/markdown/code-ranges";
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

const SEPARATOR = /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/;

function splitRow(line: string): string[] {
  let body = line.trim();
  if (body.startsWith("|")) body = body.slice(1);
  if (body.endsWith("|") && !body.endsWith("\\|")) body = body.slice(0, -1);
  const cells: string[] = [];
  let current = "";
  for (let i = 0; i < body.length; i += 1) {
    const ch = body[i];
    if (ch === "\\" && body[i + 1] === "|") {
      current += "|";
      i += 1;
    } else if (ch === "|") {
      cells.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  cells.push(current);
  return cells.map((c) => cleanCell(c));
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
    const header = lines[i];
    if (!header.includes("|") || !SEPARATOR.test(lines[i + 1])) continue;
    const headers = splitRow(header);
    if (headers.length < 2 && !header.trim().startsWith("|")) continue;
    const rows: string[][] = [];
    for (let j = i + 2; j < lines.length; j += 1) {
      const line = lines[j];
      if (!line.includes("|") || line.trim() === "") break;
      const cells = splitRow(line);
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
