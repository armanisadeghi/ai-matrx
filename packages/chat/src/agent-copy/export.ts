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
  /** Called at click time to download a file. Omit when the item opens UI. */
  build?: () => { content: BlobPart; extension: string; mime: string };
  /**
   * Caller-owned modal/window. Wins over `build` — the item opens UI
   * instead of downloading.
   */
  onSelect?: () => void | Promise<void>;
}

export function downloadFile(
  filename: string,
  content: BlobPart,
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

/**
 * A MENU WITH TWO CSVs MUST NOT KILL THE PAGE.
 *
 * `jsonExportItem` / `csvExportItem` used to hardcode `id: "json"` / `"csv"`,
 * so any surface offering two of the same format handed the content-transfer
 * registry two registrations with one id. The registry refuses duplicates
 * (`ContentTransferError: Transfer id "export:csv" is empty or registered more
 * than once`) — and because that throw happens during render it takes the WHOLE
 * route down behind "Something went wrong", not just the menu row. Every agent
 * version-diff page (`/agents/<id>/latest`, `/agents/<id>/v/<n>`) was dead this
 * way on production, found 2026-09-18: it offers "CSV (changed fields)" and
 * "CSV (all versions)", plus two JSONs.
 *
 * The id is now derived from the LABEL, which a menu must already vary: the
 * default label keeps the bare `json` / `csv` id (nothing that reads those ids
 * changes), and any custom label gets `csv:changed-fields`. Deterministic, so
 * it is stable across renders. Two items sharing one label still throw — that
 * is a menu with two identical rows, which is its own defect.
 */
function exportItemId(format: "json" | "csv", label: string, defaultLabel: string): string {
  if (label === defaultLabel) return format;
  const slug = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return slug ? `${format}:${slug}` : format;
}

export function jsonExportItem(
  data: unknown | (() => unknown),
  label = "JSON (raw data)",
): ExportItem {
  return {
    id: exportItemId("json", label, "JSON (raw data)"),
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
  rows: Array<Record<string, unknown>> | (() => Array<Record<string, unknown>>),
  label = "CSV",
  columns?: Array<{ key: string; header: string }>,
): ExportItem {
  return {
    id: exportItemId("csv", label, "CSV"),
    label,
    build: () => ({
      content: rowsToCsv(typeof rows === "function" ? rows() : rows, columns),
      extension: "csv",
      mime: "text/csv",
    }),
  };
}
