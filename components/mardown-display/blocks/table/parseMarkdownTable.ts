/**
 * parseMarkdownTable — the ONE markdown-table parser.
 *
 * Extracted from StreamingTableRenderer so the renderer AND the artifact
 * "Convert to table" path parse identically (no forked regex — the doctrine
 * primitive). Returns null for anything that isn't a well-formed markdown table
 * (header row + separator row + data rows); tolerant of streaming (0 data rows
 * yet) and of leading/trailing pipes.
 */

export interface ParsedTable {
  headers: string[];
  rows: string[][];
  /** Rows keyed by markdown-stripped header — the shape DB save / JSON export want. */
  normalizedData: Array<{ [key: string]: string }>;
}

/** Strip inline markdown from a header so it forms a clean object key. */
export function cleanTableHeaderKey(header: string): string {
  return header
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/(?<![A-Za-z0-9])_([^_\n]+?)_(?![A-Za-z0-9])/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1|$2")
    .trim();
}

export function parseMarkdownTable(content: string): ParsedTable | null {
  try {
    const lines = content.split("\n").filter((line) => line.trim().length > 0);

    // Allow 2 lines (header + separator) so an empty table renders mid-stream.
    if (lines.length < 2) return null;

    const headerLine = lines[0];
    if (!headerLine.includes("|")) return null;

    // Second line must be a markdown separator row.
    const separatorLine = lines[1];
    if (!separatorLine.match(/^\|[:\s|\-]+\|?$/)) return null;

    const parseRow = (line: string): string[] => {
      const cells = line.split("|").map((cell) => cell.trim());
      // Drop empty first/last cells from leading/trailing pipes.
      if (cells.length > 0 && cells[0] === "") cells.shift();
      if (cells.length > 0 && cells[cells.length - 1] === "") cells.pop();
      return cells;
    };

    const headers = parseRow(headerLine);
    if (headers.length === 0) return null;

    const rows = lines.slice(2).map(parseRow);
    const validRows = rows.filter((row) => row.some((cell) => cell.length > 0));

    const normalizedData = validRows.map((row) => {
      const rowData: { [key: string]: string } = {};
      headers.forEach((header, index) => {
        rowData[cleanTableHeaderKey(header)] = index < row.length ? row[index] : "";
      });
      return rowData;
    });

    return { headers, rows: validRows, normalizedData };
  } catch (error) {
    console.error("[parseMarkdownTable] Parse error:", error);
    return null;
  }
}
