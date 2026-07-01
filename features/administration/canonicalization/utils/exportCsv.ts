// features/administration/canonicalization/utils/exportCsv.ts

import Papa from "papaparse";

/** Exports the currently visible (filtered + sorted) rows as a downloadable CSV. */
export function exportRowsAsCsv<T>(
  filename: string,
  rows: T[],
  columns: { key: string; label: string; getValue: (row: T) => unknown }[],
): void {
  const fields = columns.map((c) => c.label);
  const data = rows.map((row) =>
    columns.map((c) => {
      const value = c.getValue(row);
      if (value == null) return "";
      if (Array.isArray(value)) return value.join("; ");
      if (typeof value === "object") return JSON.stringify(value);
      return String(value);
    }),
  );

  const csv = Papa.unparse({ fields, data });
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
