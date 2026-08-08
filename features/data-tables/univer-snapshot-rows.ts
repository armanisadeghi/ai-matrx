/**
 * features/data-tables/univer-snapshot-rows.ts
 *
 * Snapshot → rows: read a Univer `IWorkbookData` snapshot back out as a plain
 * string grid. The missing half of the workbook round trip — `export-targets`
 * pushes rows INTO a workbook; this reads the (possibly user-edited) values
 * back OUT so features can offer "edit in the workbook, then import your
 * changes". Values only (formulas come back as their cached value); first
 * sheet by `sheetOrder`. Reusable — do not fork a per-feature snapshot walker.
 */

interface CellShape {
  v?: unknown;
}

interface SheetShape {
  name?: string;
  cellData?: Record<string, Record<string, CellShape | null | undefined>>;
}

interface SnapshotShape {
  sheetOrder?: string[];
  sheets?: Record<string, SheetShape>;
}

export interface SnapshotRows {
  sheetName: string;
  /** Dense rectangular grid, trailing empty rows/columns trimmed. */
  rows: string[][];
}

function cellText(cell: CellShape | null | undefined): string {
  const value = cell?.v;
  if (value === null || value === undefined) return "";
  return String(value);
}

/**
 * Extract the first worksheet of a Univer workbook snapshot as a string grid.
 * Returns null when the value is not snapshot-shaped or has no sheets.
 */
export function univerSnapshotToRows(snapshot: unknown): SnapshotRows | null {
  if (typeof snapshot !== "object" || snapshot === null) return null;
  const shape = snapshot as SnapshotShape;
  const sheets = shape.sheets ?? {};
  const firstId =
    shape.sheetOrder?.find((id) => sheets[id]) ?? Object.keys(sheets)[0];
  if (!firstId) return null;
  const sheet = sheets[firstId];
  const cellData = sheet?.cellData ?? {};

  let maxRow = -1;
  let maxCol = -1;
  for (const [rowKey, row] of Object.entries(cellData)) {
    const rowIndex = Number(rowKey);
    if (!Number.isInteger(rowIndex) || !row) continue;
    for (const [colKey, cell] of Object.entries(row)) {
      const colIndex = Number(colKey);
      if (!Number.isInteger(colIndex)) continue;
      if (cellText(cell) === "") continue;
      if (rowIndex > maxRow) maxRow = rowIndex;
      if (colIndex > maxCol) maxCol = colIndex;
    }
  }
  if (maxRow < 0 || maxCol < 0) {
    return { sheetName: sheet?.name ?? "Sheet1", rows: [] };
  }

  const rows: string[][] = [];
  for (let r = 0; r <= maxRow; r += 1) {
    const row: string[] = [];
    const source = cellData[String(r)] ?? {};
    for (let c = 0; c <= maxCol; c += 1) {
      row.push(cellText(source[String(c)]));
    }
    rows.push(row);
  }
  return { sheetName: sheet?.name ?? "Sheet1", rows };
}
