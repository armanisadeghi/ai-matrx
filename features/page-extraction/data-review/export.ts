/**
 * features/page-extraction/data-review/export.ts
 *
 * Pure builders that turn a (columns, rows) view of an extraction dataset into
 * every download / clipboard format. Kept free of React + DOM-write side
 * effects except the small `downloadBlob` helper, so the same builders feed the
 * grid's export menu, future bulk-export, and the push-to-workbook/udt targets.
 */

import * as XLSX from "xlsx";

export interface ExportColumn {
  key: string;
  label: string;
}

export type ExportRow = Record<string, unknown>;

/** Stringify a single cell value deterministically for tabular output. */
export function cellToString(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean")
    return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

/** A 2-D array (header row + body) — the lingua franca for CSV / XLSX / Univer. */
export function toMatrix(
  columns: ExportColumn[],
  rows: ExportRow[],
): string[][] {
  const header = columns.map((c) => c.label);
  const body = rows.map((r) => columns.map((c) => cellToString(r[c.key])));
  return [header, ...body];
}

export function toCSV(columns: ExportColumn[], rows: ExportRow[]): string {
  const escape = (s: string) =>
    /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  return toMatrix(columns, rows)
    .map((row) => row.map(escape).join(","))
    .join("\r\n");
}

/** Tab-separated — what spreadsheets accept on paste. */
export function toTSV(columns: ExportColumn[], rows: ExportRow[]): string {
  return toMatrix(columns, rows)
    .map((row) =>
      row.map((c) => c.replace(/\t/g, " ").replace(/\r?\n/g, " ")).join("\t"),
    )
    .join("\n");
}

/** JSON array of objects keyed by column key (not label). */
export function toJSON(columns: ExportColumn[], rows: ExportRow[]): string {
  const keyed = rows.map((r) => {
    const out: Record<string, unknown> = {};
    for (const c of columns) out[c.key] = r[c.key] ?? null;
    return out;
  });
  return JSON.stringify(keyed, null, 2);
}

/** GitHub-flavoured markdown table — the AI-friendly tabular shape. */
export function toMarkdownTable(
  columns: ExportColumn[],
  rows: ExportRow[],
): string {
  if (columns.length === 0) return "";
  const head = `| ${columns.map((c) => c.label).join(" | ")} |`;
  const sep = `| ${columns.map(() => "---").join(" | ")} |`;
  const body = rows.map(
    (r) =>
      `| ${columns
        .map((c) =>
          cellToString(r[c.key]).replace(/\|/g, "\\|").replace(/\r?\n/g, " "),
        )
        .join(" | ")} |`,
  );
  return [head, sep, ...body].join("\n");
}

/** XLSX bytes built from the matrix via SheetJS (the lib the workbook importer uses). */
export function toXLSXBlob(
  columns: ExportColumn[],
  rows: ExportRow[],
  sheetName = "Extraction",
): Blob {
  const ws = XLSX.utils.aoa_to_sheet(toMatrix(columns, rows));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31) || "Sheet1");
  const out = XLSX.write(wb, { type: "array", bookType: "xlsx" });
  return new Blob([out as BlobPart], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

/** A safe-ish file slug from a dataset name. */
export function fileSlug(name: string): string {
  return (
    name
      .trim()
      .replace(/[^a-z0-9]+/gi, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase() || "extraction"
  );
}

/** Trigger a browser download for a Blob or string payload. */
export function downloadBlob(
  payload: Blob | string,
  filename: string,
  mime?: string,
): void {
  const blob =
    typeof payload === "string"
      ? new Blob([payload], { type: mime ?? "text/plain;charset=utf-8" })
      : payload;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoke on the next tick so the click has dispatched.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
