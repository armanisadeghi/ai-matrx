/**
 * xlsxToUniverWorkbook — parse a CSV/XLSX file into a Univer IWorkbookData
 * shape suitable for `apiRef.createWorkbook(...)` and for persistence as the
 * initial snapshot of a new workbook.
 *
 * V1 scope: values + types only. No styling/formatting/formulas/merged-cells
 * round-trip. The lossless aspect is preserved separately by storing the
 * original file id on `udt_workbooks.original_file_id` (P4-b wires that to
 * the universal file handler).
 *
 * For XLSX:
 *   - Reads ALL sheets (multi-sheet workbooks become multi-sheet Univer docs).
 *   - Native numbers → number cells (`t: 'n'`).
 *   - Booleans → boolean cells (`t: 'b'`).
 *   - Strings → string cells (`t: 's'`).
 *   - Dates → ISO string cells (Univer renders them readably).
 *   - Formula source is preserved as the cell's `f` field; the cached value
 *     becomes the visible `v`. (Univer recomputes when supported; otherwise
 *     the cached value persists.)
 *
 * For CSV: parsed via xlsx as a single-sheet workbook so the same converter
 * applies.
 */

import * as XLSX from "xlsx";
import type { IWorkbookData } from "@univerjs/core";
import { LocaleType } from "@univerjs/presets";

// Univer's cell `t` enum (kept as a TS-side literal so we don't import a
// runtime symbol we don't otherwise need):
//   1 = STRING, 2 = NUMBER, 3 = BOOLEAN, 4 = FORMULA, 0 = DEFAULT
const CELL_TYPE_STRING = 1;
const CELL_TYPE_NUMBER = 2;
const CELL_TYPE_BOOLEAN = 3;

type UniverCellValue = number | string | boolean;

interface UniverCell {
  v?: UniverCellValue;
  t?: number;
  /** Formula source (e.g. "=A1+B1"). Univer keeps `v` as the cached value. */
  f?: string;
}

interface UniverSheet {
  id: string;
  name: string;
  cellData: Record<number, Record<number, UniverCell>>;
  rowCount: number;
  columnCount: number;
}

export async function xlsxToUniverWorkbook(
  file: File,
): Promise<Partial<IWorkbookData>> {
  const buf = await file.arrayBuffer();
  // `cellDates: true` so date cells come back as JS Dates rather than
  // serial-number numerics. `cellFormula: true` keeps the formula source.
  const wb = XLSX.read(buf, { type: "array", cellDates: true, cellFormula: true });

  const sheets: Record<string, UniverSheet> = {};
  const sheetOrder: string[] = [];

  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    if (!ws) continue;

    const id = sanitizeSheetId(sheetName);
    sheetOrder.push(id);
    sheets[id] = convertSheet(ws, sheetName, id);
  }

  return {
    id: randomId("wb-"),
    sheetOrder,
    name: file.name.replace(/\.[^.]+$/, ""),
    appVersion: "1",
    locale: LocaleType.EN_US,
    styles: {},
    sheets: sheets as unknown as IWorkbookData["sheets"],
  };
}

function convertSheet(
  ws: XLSX.WorkSheet,
  displayName: string,
  id: string,
): UniverSheet {
  const refRange = ws["!ref"] ?? "A1:A1";
  const range = XLSX.utils.decode_range(refRange);
  const cellData: Record<number, Record<number, UniverCell>> = {};

  for (let r = range.s.r; r <= range.e.r; r++) {
    const rowOut: Record<number, UniverCell> = {};
    for (let c = range.s.c; c <= range.e.c; c++) {
      const addr = XLSX.utils.encode_cell({ r, c });
      const cell = ws[addr] as XLSX.CellObject | undefined;
      if (!cell || cell.v === undefined || cell.v === null) continue;

      rowOut[c] = toUniverCell(cell);
    }
    if (Object.keys(rowOut).length > 0) {
      cellData[r] = rowOut;
    }
  }

  // Univer needs a row/column count >= the range. Pad with sensible mins so
  // the user has room to grow without immediately hitting bounds.
  const rowCount = Math.max(range.e.r + 1, 100);
  const columnCount = Math.max(range.e.c + 1, 26);

  return {
    id,
    name: displayName.slice(0, 31), // Excel sheet-name max
    cellData,
    rowCount,
    columnCount,
  };
}

function toUniverCell(cell: XLSX.CellObject): UniverCell {
  const out: UniverCell = {};

  if (cell.f) {
    // Formula source preserved; cached value goes through the same value
    // mapping as a literal so display works even if Univer doesn't recompute.
    out.f = `=${cell.f.replace(/^=/, "")}`;
  }

  switch (cell.t) {
    case "n":
      out.v = typeof cell.v === "number" ? cell.v : Number(cell.v ?? 0);
      out.t = CELL_TYPE_NUMBER;
      break;
    case "b":
      out.v = Boolean(cell.v);
      out.t = CELL_TYPE_BOOLEAN;
      break;
    case "d":
      // SheetJS gives us a JS Date when `cellDates: true`.
      out.v =
        cell.v instanceof Date
          ? cell.v.toISOString().slice(0, 10)
          : String(cell.v ?? "");
      out.t = CELL_TYPE_STRING;
      break;
    case "e":
      // Error cell — surface as the error string SheetJS produced.
      out.v = typeof cell.w === "string" ? cell.w : "#ERROR";
      out.t = CELL_TYPE_STRING;
      break;
    case "s":
    default:
      out.v =
        typeof cell.v === "string"
          ? cell.v
          : cell.v === undefined || cell.v === null
            ? ""
            : String(cell.v);
      out.t = CELL_TYPE_STRING;
      break;
  }

  return out;
}

function sanitizeSheetId(name: string): string {
  // Univer expects opaque-ish ids; collapse to alphanumerics + dash and
  // suffix with a short random to avoid collisions on dup sheet names.
  const base = name.replace(/[^A-Za-z0-9_-]+/g, "-").slice(0, 32);
  return `${base || "sheet"}-${Math.random().toString(36).slice(2, 8)}`;
}

function randomId(prefix: string): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return prefix + crypto.randomUUID();
  }
  return `${prefix}${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
