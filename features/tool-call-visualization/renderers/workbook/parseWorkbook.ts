import type { ToolLifecycleEntry } from "@/features/agents/types/request.types";
import { resultAsObject, getArg } from "../_shared";

/**
 * Parse the `workbook` tool result:
 * { action, workbook_id, name, sheets: [{sheet_id, name, used_rows, used_cols}],
 *   first_sheet: { sheet_name, rows, cols, values: unknown[][] } }
 */
export interface ParsedWorkbookSheet {
  name: string | null;
  rows: number;
  cols: number;
  values: unknown[][];
}

export interface ParsedWorkbook {
  id: string | null;
  name: string | null;
  sheetCount: number;
  firstSheet: ParsedWorkbookSheet | null;
}

const asStr = (v: unknown): string | null =>
  typeof v === "string" && v ? v : null;
const asNum = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

export function parseWorkbook(entry: ToolLifecycleEntry): ParsedWorkbook {
  const r = resultAsObject(entry) ?? {};
  const sheets = Array.isArray(r.sheets) ? r.sheets : [];
  const fs = (
    r.first_sheet && typeof r.first_sheet === "object" ? r.first_sheet : null
  ) as Record<string, unknown> | null;

  const firstSheet: ParsedWorkbookSheet | null = fs
    ? {
        name: asStr(fs.sheet_name) ?? asStr(fs.name),
        rows: asNum(fs.rows) ?? 0,
        cols: asNum(fs.cols) ?? 0,
        values: Array.isArray(fs.values) ? (fs.values as unknown[][]) : [],
      }
    : null;

  return {
    id: asStr(r.workbook_id) ?? asStr(r.id) ?? asStr(getArg<string>(entry, "id")),
    name: asStr(r.name),
    sheetCount: sheets.length,
    firstSheet,
  };
}
