/**
 * univerToXlsx — convert a Univer IWorkbookData snapshot back to an .xlsx
 * file and trigger a download in the browser.
 *
 * Symmetric counterpart to `xlsx-to-univer.ts`. V1 scope is the same:
 * values + types + formula source + merged ranges per sheet, ISO-style date
 * strings, no styles / advanced number formats. The "lossless" original lives
 * on `udt_workbooks.original_file_id` (file-handler linkage pending).
 *
 * Why we don't use Univer's own export plugin: it's gated behind the
 * advanced presets bundle, which adds ~hundreds of kB. Alchemy's `xlsx-workbook`
 * format is the one workbook writer, and its reader is the import path's, so this
 * round-trips through the same engine.
 */

import { buildFile } from "@ai-matrx/alchemy/operate";
import type { WorkbookCellJson, WorkbookJson } from "@ai-matrx/alchemy/operate/read";
import { CellValueType } from "@univerjs/core";
import type { ICellData, IWorkbookData, IWorksheetData } from "@univerjs/core";
import { downloadFile } from "@ai-matrx/kit/download";

export type ExportXlsxOptions = {
  /** File name without extension. Defaults to "workbook". */
  filename?: string;
};

/** A Univer snapshot as the `xlsx-workbook` format's value (sheets of typed cells + merges). */
export function univerSnapshotToWorkbookJson(snapshot: Partial<IWorkbookData>): WorkbookJson {
  const sheetOrder = snapshot.sheetOrder ?? Object.keys(snapshot.sheets ?? {});
  const sheets: WorkbookJson["sheets"] = [];
  for (const sheetId of sheetOrder) {
    const sheet = snapshot.sheets?.[sheetId];
    if (!sheet) continue;
    sheets.push(sheetToJson(sheet, (sheet.name ?? sheetId).slice(0, 31) || "Sheet1"));
  }
  return { sheets };
}

/**
 * Build XLSX bytes from a Univer snapshot. Does NOT trigger a download — the
 * caller decides what to do with the bytes (download, upload, attach, etc.).
 */
export async function univerSnapshotToXlsxBytes(snapshot: Partial<IWorkbookData>): Promise<Uint8Array> {
  const value = univerSnapshotToWorkbookJson(snapshot);
  const built = await buildFile({ kind: "registered", format: "workbook", value }, "xlsx-workbook");
  return built.bytes;
}

/**
 * Convenience: convert + trigger a browser download. No-op when called
 * server-side (no document / Blob).
 */
export async function downloadUniverAsXlsx(
  snapshot: Partial<IWorkbookData>,
  options: ExportXlsxOptions = {},
): Promise<void> {
  if (typeof document === "undefined") return;
  const filename = `${(options.filename ?? "workbook").replace(/\.xlsx$/i, "")}.xlsx`;
  const built = await buildFile(
    { kind: "registered", format: "workbook", value: univerSnapshotToWorkbookJson(snapshot) },
    "xlsx-workbook",
    { filename },
  );
  const blob = built.blob();
  downloadFile(built.filename, blob, blob.type);
}

// ─── internals ────────────────────────────────────────────────────────────

function sheetToJson(sheet: Partial<IWorksheetData>, name: string): WorkbookJson["sheets"][number] {
  const cellData = sheet.cellData ?? {};
  const rows: (WorkbookCellJson | null)[][] = [];
  for (const rKey of Object.keys(cellData)) {
    const r = Number(rKey);
    if (!Number.isFinite(r)) continue;
    const row = cellData[r];
    if (!row) continue;
    for (const cKey of Object.keys(row)) {
      const c = Number(cKey);
      if (!Number.isFinite(c)) continue;
      const cell = row[c];
      if (!cell) continue;
      const out = toWorkbookCell(cell);
      if (!out) continue;
      while (rows.length <= r) rows.push([]);
      const line = rows[r]!;
      while (line.length < c) line.push(null);
      line[c] = out;
    }
  }
  const merges = (sheet.mergeData ?? []).map((m) => ({
    s: { r: m.startRow, c: m.startColumn },
    e: { r: m.endRow, c: m.endColumn },
  }));
  return { name, rows, ...(merges.length ? { merges } : {}) };
}

function toWorkbookCell(cell: ICellData): WorkbookCellJson | null {
  // `f` (formula) takes precedence on display but we keep `v` as the cached
  // value so spreadsheets that don't recompute still show data.
  const formula = typeof cell.f === "string" ? cell.f.replace(/^=/, "") : undefined;

  let out: WorkbookCellJson;
  switch (cell.t) {
    case CellValueType.NUMBER:
      out = { t: "n", v: typeof cell.v === "number" ? cell.v : Number(cell.v ?? 0) };
      break;
    case CellValueType.BOOLEAN:
      out = { t: "b", v: Boolean(cell.v) };
      break;
    case CellValueType.FORCE_STRING:
    case CellValueType.STRING:
    default:
      out = {
        t: "s",
        v:
          cell.v === null || cell.v === undefined
            ? ""
            : typeof cell.v === "object"
              ? JSON.stringify(cell.v)
              : String(cell.v),
      };
      break;
  }

  // Skip cells with no value AND no formula — there's nothing to write.
  if ((out.v === "" || out.v === null || out.v === undefined) && !formula) return null;
  return formula ? { ...out, f: formula } : out;
}
