/**
 * parseMarkdownTable — the ONE markdown-table parser.
 *
 * Extracted from StreamingTableRenderer so the renderer AND the artifact
 * "Convert to table" path parse identically (no forked regex — the doctrine
 * primitive). Returns null for anything that isn't a well-formed markdown table
 * (header row + separator row + data rows); tolerant of streaming (0 data rows
 * yet) and of leading/trailing pipes.
 */

import { unwrapCodeSpans } from "@/lib/markdown/code-ranges";
import { rowCells } from "@/components/rich-editor/core/table-source";

export interface ParsedTable {
  headers: string[];
  rows: string[][];
  /** Rows keyed by markdown-stripped header — the shape DB save / JSON export want. */
  normalizedData: Array<{ [key: string]: string }>;
}

/** Strip inline markdown from a header so it forms a clean object key. */
export function cleanTableHeaderKey(header: string): string {
  return unwrapCodeSpans(header)
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/(?<![A-Za-z0-9])_([^_\n]+?)_(?![A-Za-z0-9])/g, "$1")
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

    // Second line must be a delimiter row — GFM's rule: every cell is `:?-+:?`,
    // edge pipes optional (`--- | ---` is as valid as `|---|---|`).
    const separatorLine = lines[1];
    const delimiters = rowCells(separatorLine);
    if (!separatorLine.includes("-") || !delimiters.length || !delimiters.every((cell) => /^:?-+:?$/.test(cell))) return null;

    // An escaped `\|` is part of its cell, never a boundary (the table writer
    // reads rows the same way: components/rich-editor/core/table-source.ts).
    const parseRow = rowCells;

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
