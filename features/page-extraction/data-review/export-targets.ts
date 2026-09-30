/**
 * features/page-extraction/data-review/export-targets.ts
 *
 * "Send this dataset somewhere it can keep living" — the two structured push
 * targets beyond a file download:
 *
 *   • Workbook  → the Excel / Google-Sheets equivalent (`udt_workbooks`),
 *                 via the canonical workbook-service + a Univer snapshot.
 *   • Dataset   → a typed user data table (`udt_datasets`), via the canonical
 *                 create_new_user_table_dynamic RPC family.
 *
 * Both reuse the existing services — this module only adapts an extraction
 * (columns, rows) view into each target's input shape. No new persistence
 * primitive is introduced.
 */

"use client";

import { CellValueType } from "@univerjs/core";
import type { ICellData, IWorkbookData, IWorksheetData } from "@univerjs/core";
import { LocaleType } from "@univerjs/presets";

import {
  createWorkbook,
  saveSnapshot,
} from "@/features/data-tables/workbook-service";
import { isServiceFailure } from "@/features/data-tables/types";
import { cellToString, type ExportColumn, type ExportRow } from "./export";

export interface PushResult {
  ok: boolean;
  /** Id of the created resource (workbook id / table id). */
  id?: string;
  /** Relative URL to open the created resource. */
  href?: string;
  error?: string;
}

// ─── Workbook target ────────────────────────────────────────────────────────

function rowsToUniverSnapshot(
  name: string,
  columns: ExportColumn[],
  rows: ExportRow[],
): Partial<IWorkbookData> {
  const cellData: NonNullable<IWorksheetData["cellData"]> = {};

  // Header row.
  const headerRow: Record<number, ICellData> = {};
  columns.forEach((c, ci) => {
    headerRow[ci] = { v: c.label, t: CellValueType.STRING };
  });
  cellData[0] = headerRow;

  // Body rows.
  rows.forEach((r, ri) => {
    const out: Record<number, ICellData> = {};
    columns.forEach((c, ci) => {
      const raw = r[c.key];
      if (raw == null || raw === "") return;
      if (typeof raw === "number") {
        out[ci] = { v: raw, t: CellValueType.NUMBER };
      } else if (typeof raw === "boolean") {
        out[ci] = { v: raw, t: CellValueType.BOOLEAN };
      } else {
        out[ci] = { v: cellToString(raw), t: CellValueType.STRING };
      }
    });
    if (Object.keys(out).length > 0) cellData[ri + 1] = out;
  });

  const rowCount = Math.max(rows.length + 1, 100);
  const columnCount = Math.max(columns.length, 26);
  const sheetId = `sheet-${Math.random().toString(36).slice(2, 8)}`;

  return {
    id: `wb-${typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : Date.now()}`,
    name,
    appVersion: "1",
    locale: LocaleType.EN_US,
    styles: {},
    sheetOrder: [sheetId],
    sheets: {
      [sheetId]: {
        id: sheetId,
        name: name.slice(0, 31) || "Extraction",
        cellData,
        rowCount,
        columnCount,
      },
    },
  };
}

export async function pushToWorkbook(
  name: string,
  columns: ExportColumn[],
  rows: ExportRow[],
  organizationId?: string,
): Promise<PushResult> {
  try {
    if (!organizationId)
      return {
        ok: false,
        error: "Select an organization before creating a workbook.",
      };
    const created = await createWorkbook({
      name,
      description: "Created from a PDF extraction dataset",
      source: "created",
      organizationId,
    });
    if (isServiceFailure(created)) return { ok: false, error: created.error };

    const snapshot = rowsToUniverSnapshot(name, columns, rows);
    const saved = await saveSnapshot({
      workbookId: created.data.id,
      snapshot,
      origin: "imported",
      label: name,
    });
    if (isServiceFailure(saved)) return { ok: false, error: saved.error };

    return {
      ok: true,
      id: created.data.id,
      href: `/workbooks/${created.data.id}`,
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// ─── The data-table target: the ONE "Save to a table" ───────────────────────

/**
 * An extraction view as the rows the one "Save to a table" screen takes (SAVE-AS-TABLE-EVERYWHERE,
 * VERIFIER-30 #5). This used to create the table itself (`createTable` + a row loop) — a second save
 * path beside the overlay. The column types it carried (text, number, integer, yes/no) are exactly
 * what the screen proposes from the values, and the person can change any of them there.
 */
export function datasetGrid(columns: ExportColumn[], rows: ExportRow[]): { headers: string[]; rows: string[][] } {
  return {
    headers: columns.map((c) => c.label),
    rows: rows.map((r) => columns.map((c) => cellToString(r[c.key]))),
  };
}
