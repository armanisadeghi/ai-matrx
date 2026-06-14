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

import { supabase } from "@/utils/supabase/client";
import {
  createWorkbook,
  saveSnapshot,
} from "@/features/data-tables/workbook-service";
import { isServiceFailure } from "@/features/data-tables/types";
import {
  addRow,
  createTable,
  type FieldDefinition,
} from "@/utils/user-table-utls/table-utils";
import { sanitizeFieldName } from "@/utils/user-table-utls/field-name-sanitizer";
import { cellToString, type ExportColumn, type ExportRow } from "./export";
import type { ColumnType } from "@/features/page-extraction/types";

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
): Promise<PushResult> {
  try {
    const created = await createWorkbook({
      name,
      description: "Created from a PDF extraction dataset",
      source: "created",
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

// ─── Typed dataset target ───────────────────────────────────────────────────

const COLUMN_TYPE_TO_DATASET: Record<ColumnType, FieldDefinition["data_type"]> =
  {
    string: "string",
    number: "number",
    integer: "integer",
    boolean: "boolean",
  };

/**
 * Create a typed user dataset from an extraction view and copy every row in.
 * `createTable` sanitizes field names server-side; we sanitize identically here
 * so each row's keys line up with the columns that were created.
 */
export async function pushToDataset(
  name: string,
  columns: Array<ExportColumn & { type?: ColumnType }>,
  rows: ExportRow[],
): Promise<PushResult> {
  try {
    const fields: FieldDefinition[] = columns.map((c, i) => ({
      field_name: c.key,
      display_name: c.label,
      data_type: COLUMN_TYPE_TO_DATASET[c.type ?? "string"] ?? "string",
      field_order: i,
      is_required: false,
    }));

    const created = await createTable(supabase, {
      tableName: name,
      description: "Created from a PDF extraction dataset",
      fields,
    });
    if (!created.success || !created.tableId) {
      return { ok: false, error: created.error ?? "Could not create dataset" };
    }

    // Map original column keys → the sanitized field names the table now uses.
    const keyToField = new Map<string, string>();
    for (const c of columns) keyToField.set(c.key, sanitizeFieldName(c.key));

    // Insert rows with a small concurrency pool so a large dataset doesn't fan
    // out hundreds of simultaneous requests. Failures are collected, not fatal.
    let failures = 0;
    const POOL = 6;
    for (let i = 0; i < rows.length; i += POOL) {
      const batch = rows.slice(i, i + POOL);
      const results = await Promise.all(
        batch.map((r) => {
          const data: Record<string, unknown> = {};
          for (const c of columns) {
            const v = r[c.key];
            if (v !== undefined) data[keyToField.get(c.key) ?? c.key] = v;
          }
          return addRow(supabase, { tableId: created.tableId!, data });
        }),
      );
      failures += results.filter((res) => !res.success).length;
    }

    if (failures > 0) {
      return {
        ok: true,
        id: created.tableId,
        href: `/data/${created.tableId}`,
        error: `${failures} of ${rows.length} rows failed to copy.`,
      };
    }
    return { ok: true, id: created.tableId, href: `/data/${created.tableId}` };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
