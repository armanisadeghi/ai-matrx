import * as XLSX from "xlsx";

import { exportFilename } from "@/components/agent-copy/export";
import { columnId, getCellValue, stringifyCellValue } from "./filter-engine";
import type { MatrxColumnDef } from "./types";

/**
 * Download the same visible columns and rendered cell values used by the
 * canonical table's CSV export as a real Excel workbook. This module is loaded
 * only after the user chooses Excel from the unified action menu.
 */
export function downloadTableAsXlsx<T>({
  rows,
  columns,
  label,
}: {
  rows: T[];
  columns: MatrxColumnDef<T>[];
  label: string;
}) {
  const visibleColumns = columns.filter(
    (column) => column.filter !== false || column.accessorKey,
  );
  const headers = visibleColumns.map((column) =>
    typeof column.header === "string" ? column.header : columnId(column),
  );
  const values = rows.map((row) =>
    visibleColumns.map((column) =>
      stringifyCellValue(getCellValue(row, column)),
    ),
  );
  const worksheet = XLSX.utils.aoa_to_sheet([headers, ...values]);
  const workbook = XLSX.utils.book_new();
  const sheetName = label.replace(/[\\/?*[\]:]/g, " ").trim().slice(0, 31) || "Data";
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
  XLSX.writeFile(workbook, exportFilename(label, "xlsx"), {
    compression: true,
  });
}
