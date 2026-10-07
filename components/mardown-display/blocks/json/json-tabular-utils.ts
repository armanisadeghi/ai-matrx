/**
 * Utilities for the JSON-aware code block: parse, detect tabular shape,
 * and export to common interchange formats (CSV, NDJSON, XLSX).
 *
 * The detection rules are intentionally permissive — we offer Table view
 * whenever a sensible interpretation exists, then let the user pick. A
 * mediocre table render on borderline data is fine; an absent option on
 * obviously-tabular data is the worse failure mode.
 */

import { buildFile } from "@ai-matrx/alchemy/operate";
import { toDelimitedText } from "@ai-matrx/alchemy/operate/read";
import { downloadFile } from "@ai-matrx/kit/download";

export type TabularSource =
  | "array-of-objects"
  | "matrix"
  | "wrapped-array"
  | "none";

export interface TabularShape {
  /** True when we can render `rows` as a sensible table. */
  isTabular: boolean;
  /** Normalized row records — never holds the original parsed value. */
  rows: Record<string, unknown>[];
  /** Ordered column names (union of keys for object-rows, indices for matrix). */
  columns: string[];
  /** Where the rows came from inside the original payload. */
  source: TabularSource;
  /** For `wrapped-array`: the key whose value held the inner array. */
  wrapperKey?: string;
}

export interface ParseResult {
  ok: boolean;
  value?: unknown;
  error?: string;
}

/**
 * Strict JSON parse — no Python/single-quote/trailing-comma fallback.
 * Streaming/partial content stays in code view, so we never want to be
 * "clever" here and accidentally render half-baked structures as tables.
 */
export function parseJsonSafe(text: string): ParseResult {
  if (!text || !text.trim()) {
    return { ok: false, error: "Empty input" };
  }
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * Detect a tabular interpretation of a parsed JSON value, in priority order:
 *
 *   1. Array of objects                            → array-of-objects
 *   2. Matrix (array of equal-length arrays)       → matrix
 *   3. Object with exactly one array-valued key
 *      whose inner array satisfies (1) or (2)      → wrapped-array
 *   4. Otherwise                                   → not tabular
 *
 * The cell values are returned as-is (still unknown). Rendering decides
 * how to display nested objects/arrays in a cell.
 */
export function detectTabular(value: unknown): TabularShape {
  // (1) Array of objects
  if (Array.isArray(value) && value.length > 0 && value.every(isPlainObject)) {
    const cols = new Set<string>();
    for (const row of value as Record<string, unknown>[]) {
      for (const k of Object.keys(row)) cols.add(k);
    }
    return {
      isTabular: true,
      rows: value as Record<string, unknown>[],
      columns: Array.from(cols),
      source: "array-of-objects",
    };
  }

  // (2) Matrix
  if (Array.isArray(value) && value.length > 0 && value.every(Array.isArray)) {
    const lens = new Set((value as unknown[][]).map((r) => r.length));
    if (lens.size === 1) {
      const first = value[0] as unknown[];
      const allStrings = first.every((c) => typeof c === "string");
      const columns = allStrings
        ? (first as string[]).map(String)
        : first.map((_, i) => `col_${i + 1}`);
      const dataRows = (
        allStrings ? (value as unknown[][]).slice(1) : (value as unknown[][])
      ) as unknown[][];
      const rows = dataRows.map((r) =>
        Object.fromEntries(columns.map((c, i) => [c, r[i]])),
      );
      return {
        isTabular: true,
        rows,
        columns,
        source: "matrix",
      };
    }
  }

  // (3) Object with single array-valued key
  if (isPlainObject(value)) {
    const arrayKeys = Object.keys(value).filter((k) =>
      Array.isArray((value as Record<string, unknown>)[k]),
    );
    if (arrayKeys.length === 1) {
      const wrapperKey = arrayKeys[0];
      const inner = (value as Record<string, unknown>)[wrapperKey];
      const recur = detectTabular(inner);
      if (recur.isTabular) {
        return { ...recur, source: "wrapped-array", wrapperKey };
      }
    }
  }

  return { isTabular: false, rows: [], columns: [], source: "none" };
}

/**
 * Stringify a cell for CSV/text export. Objects/arrays become compact JSON.
 * `null` and `undefined` become empty strings (Excel-friendly).
 */
export function cellToCsv(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

/**
 * Rows -> CSV/TSV text through Alchemy's one writer (quoting, line breaks, `'` before a leading
 * = + - @ text; real numbers stay numbers, so -5 is never altered).
 */
export function rowsToCsv(
  rows: Record<string, unknown>[],
  columns: string[],
  delimiter = ",",
): string {
  return toDelimitedText(
    columns,
    rows.map((row) => columns.map((c) => cellToCsvValue(row[c]))),
    { format: delimiter === "\t" ? "tsv" : "csv", spreadsheetSafe: true },
  );
}

function cellToCsvValue(value: unknown): string | number | boolean {
  if (value === null || value === undefined) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  return cellToCsv(value);
}

export function rowsToNdjson(rows: unknown[]): string {
  return rows.map((r) => JSON.stringify(r)).join("\n");
}

/** Browser file-download for a text payload. */
export function downloadText(
  filename: string,
  content: string,
  mime = "text/plain",
): void {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  downloadFile(filename, blob, blob.type);
}

/**
 * XLSX export through Alchemy's workbook format (the one spreadsheet engine).
 * Header row = `columns`; object/array cells are pre-stringified so
 * spreadsheets receive plain text instead of "[object Object]".
 */
export async function rowsToXlsx(
  rows: Record<string, unknown>[],
  columns: string[],
  filename: string,
): Promise<void> {
  const cell = (v: unknown): string | number | boolean | null =>
    v === null || v === undefined
      ? null
      : typeof v === "object"
        ? JSON.stringify(v)
        : typeof v === "string" || typeof v === "number" || typeof v === "boolean"
          ? v
          : String(v);
  const built = await buildFile(
    {
      kind: "registered",
      format: "workbook",
      value: { sheets: [{ name: "Data", rows: [columns, ...rows.map((row) => columns.map((c) => cell(row[c])))] }] },
    },
    "xlsx-workbook",
    { filename },
  );
  const blob = built.blob();
  downloadFile(built.filename, blob, blob.type);
}

/** Default filename helper (no extension). */
export function defaultJsonFilename(): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  return `json-${stamp}`;
}
