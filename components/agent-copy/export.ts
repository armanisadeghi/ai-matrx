/**
 * File-export primitives for data surfaces — the download counterpart to
 * CopyButtons. Any surface showing structured data offers export, not just
 * clipboard copy; text on a screen with no way out is a defect.
 *
 * Pure browser utils (Blob + anchor). No SDKs, no server round-trip.
 */

export interface ExportItem {
  id: string;
  /** Menu row label, e.g. "JSON (raw data)" or "CSV (current view)". */
  label: string;
  /** Called at click time. */
  build: () => { content: string; extension: string; mime: string };
}

export function downloadFile(
  filename: string,
  content: string,
  mime: string,
): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

/** Sanitized `base-2026-07-27.ext` filename. */
export function exportFilename(base: string, extension: string): string {
  const slug = base
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  const date = new Date().toISOString().slice(0, 10);
  return `${slug || "export"}-${date}.${extension}`;
}

export function jsonExportItem(
  data: unknown | (() => unknown),
  label = "JSON (raw data)",
): ExportItem {
  return {
    id: "json",
    label,
    build: () => ({
      content: JSON.stringify(
        typeof data === "function" ? (data as () => unknown)() : data,
        null,
        2,
      ),
      extension: "json",
      mime: "application/json",
    }),
  };
}

export function textExportItem(
  content: string | (() => string),
  label: string,
  extension = "txt",
): ExportItem {
  return {
    id: `text-${extension}`,
    label,
    build: () => ({
      content: typeof content === "function" ? content() : content,
      extension,
      mime: "text/plain",
    }),
  };
}

function csvEscape(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** Rows → CSV. Columns: explicit list, or the union of keys across rows. */
export function rowsToCsv(
  rows: Array<Record<string, unknown>>,
  columns?: Array<{ key: string; header: string }>,
): string {
  const cols =
    columns ??
    [...new Set(rows.flatMap((row) => Object.keys(row)))].map((key) => ({
      key,
      header: key,
    }));
  const lines = [cols.map((c) => csvEscape(c.header)).join(",")];
  for (const row of rows) {
    lines.push(
      cols
        .map((c) => {
          const value = row[c.key];
          if (value === null || value === undefined) return "";
          return csvEscape(
            typeof value === "object" ? JSON.stringify(value) : String(value),
          );
        })
        .join(","),
    );
  }
  return lines.join("\n");
}

export function csvExportItem(
  rows:
    | Array<Record<string, unknown>>
    | (() => Array<Record<string, unknown>>),
  label = "CSV",
  columns?: Array<{ key: string; header: string }>,
): ExportItem {
  return {
    id: "csv",
    label,
    build: () => ({
      content: rowsToCsv(
        typeof rows === "function" ? rows() : rows,
        columns,
      ),
      extension: "csv",
      mime: "text/csv",
    }),
  };
}
