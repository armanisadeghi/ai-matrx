/**
 * univerToXlsx — convert a Univer IWorkbookData snapshot back to an .xlsx
 * file and trigger a download in the browser.
 *
 * Symmetric counterpart to `xlsx-to-univer.ts`. V1 scope is the same:
 * values + types + formula source per sheet, ISO-style date strings, no
 * styles / merges / advanced number formats. The "lossless" original lives
 * on `udt_workbooks.original_file_id` (file-handler linkage pending).
 *
 * Why we don't use Univer's own export plugin: it's gated behind the
 * advanced presets bundle, which adds ~hundreds of kB. SheetJS is already
 * installed for the import path, so this round-trips through the same lib.
 */

import * as XLSX from "xlsx";
import { CellValueType } from "@univerjs/core";
import type { ICellData, IWorkbookData, IWorksheetData } from "@univerjs/core";

export type ExportXlsxOptions = {
  /** File name without extension. Defaults to "workbook". */
  filename?: string;
};

/**
 * Build an XLSX ArrayBuffer from a Univer snapshot. Does NOT trigger a
 * download — the caller decides what to do with the bytes (download,
 * upload, attach to an email, etc.).
 */
export function univerSnapshotToXlsxBuffer(
  snapshot: Partial<IWorkbookData>,
): ArrayBuffer {
  const wb = XLSX.utils.book_new();

  const sheetOrder = snapshot.sheetOrder ?? Object.keys(snapshot.sheets ?? {});
  for (const sheetId of sheetOrder) {
    const sheet = snapshot.sheets?.[sheetId];
    if (!sheet) continue;
    const ws = sheetToWorksheet(sheet);
    const name = (sheet.name ?? sheetId).slice(0, 31) || "Sheet1";
    XLSX.utils.book_append_sheet(wb, ws, dedupedSheetName(wb, name));
  }

  // If the snapshot had zero sheets, give the user a single empty one so
  // Excel can open the file.
  if (wb.SheetNames.length === 0) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([[""]]), "Sheet1");
  }

  return XLSX.write(wb, { type: "array", bookType: "xlsx" });
}

/**
 * Convenience: convert + trigger a browser download. No-op when called
 * server-side (no document / Blob).
 */
export function downloadUniverAsXlsx(
  snapshot: Partial<IWorkbookData>,
  options: ExportXlsxOptions = {},
): void {
  if (typeof document === "undefined") return;

  const buffer = univerSnapshotToXlsxBuffer(snapshot);
  const filename = `${(options.filename ?? "workbook").replace(/\.xlsx$/i, "")}.xlsx`;
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Defer revoke so the click handler finishes processing the URL.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

// ─── internals ────────────────────────────────────────────────────────────

function sheetToWorksheet(sheet: Partial<IWorksheetData>): XLSX.WorkSheet {
  const cellData = sheet.cellData ?? {};
  const out: XLSX.WorkSheet = {};
  let maxR = -1;
  let maxC = -1;

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
      const sheetCell = toSheetJsCell(cell);
      if (sheetCell) {
        const addr = XLSX.utils.encode_cell({ r, c });
        out[addr] = sheetCell;
        if (r > maxR) maxR = r;
        if (c > maxC) maxC = c;
      }
    }
  }

  if (maxR < 0 || maxC < 0) {
    // Empty sheet — give SheetJS a stub range so it serializes a valid
    // worksheet rather than tripping the "no !ref" path.
    out["!ref"] = "A1:A1";
    return out;
  }
  out["!ref"] = XLSX.utils.encode_range({
    s: { r: 0, c: 0 },
    e: { r: maxR, c: maxC },
  });
  return out;
}

function toSheetJsCell(cell: ICellData): XLSX.CellObject | null {
  // `f` (formula) takes precedence on display in SheetJS but we keep `v` as
  // the cached value so spreadsheets that don't recompute still show data.
  const formula = typeof cell.f === "string" ? cell.f.replace(/^=/, "") : undefined;

  // Univer's CellValueType numeric → SheetJS string `t` code.
  let t: XLSX.CellObject["t"] = "s";
  let v: XLSX.CellObject["v"];

  switch (cell.t) {
    case CellValueType.NUMBER:
      t = "n";
      v = typeof cell.v === "number" ? cell.v : Number(cell.v ?? 0);
      break;
    case CellValueType.BOOLEAN:
      t = "b";
      v = Boolean(cell.v);
      break;
    case CellValueType.FORCE_STRING:
    case CellValueType.STRING:
    default:
      t = "s";
      v =
        cell.v === null || cell.v === undefined
          ? ""
          : typeof cell.v === "object"
            ? JSON.stringify(cell.v)
            : String(cell.v);
      break;
  }

  // Skip cells with no value AND no formula — there's nothing to write.
  if ((v === "" || v === null || v === undefined) && !formula) return null;

  const sheetCell: XLSX.CellObject = { t, v };
  if (formula) sheetCell.f = formula;
  return sheetCell;
}

function dedupedSheetName(wb: XLSX.WorkBook, name: string): string {
  if (!wb.SheetNames.includes(name)) return name;
  let i = 2;
  while (wb.SheetNames.includes(`${name} (${i})`)) i++;
  return `${name} (${i})`;
}
