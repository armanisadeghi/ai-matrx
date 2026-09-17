// CX Dashboard Export Utilities

import type { CopyExportConfig } from "@ai-matrx/design-system/data-table/copy-types";

type CxExportData = Record<string, unknown>[];

export type CxExportFile = {
  content: string;
  extension: "csv" | "json";
  filename: string;
  mime: "text/csv;charset=utf-8;" | "application/json";
};

function formatDateForFilename(): string {
  return new Date().toISOString().slice(0, 10);
}

function buildFilename(viewName: string, filters?: Record<string, string>): string {
  const parts = ["cx", viewName];
  if (filters) {
    if (filters.timeframe && filters.timeframe !== "all") {
      parts.push(filters.timeframe);
    }
    if (filters.start_date && filters.end_date) {
      parts.push(`${filters.start_date}-to-${filters.end_date}`);
    }
    if (filters.provider) parts.push(filters.provider.toLowerCase());
    if (filters.status) parts.push(filters.status);
  }
  parts.push(formatDateForFilename());
  return parts.join("-");
}

export function buildCxCsvExport(
  data: CxExportData,
  viewName: string,
  filters?: Record<string, string>
): CxExportFile | null {
  if (!data.length) return null;
  const headers = Object.keys(data[0]);
  const csvRows = [
    headers.join(","),
    ...data.map((row) =>
      headers
        .map((h) => {
          const val = row[h];
          if (val === null || val === undefined) return "";
          const str = typeof val === "object" ? JSON.stringify(val) : String(val);
          return str.includes(",") || str.includes('"') || str.includes("\n")
            ? `"${str.replace(/"/g, '""')}"`
            : str;
        })
        .join(",")
      ),
  ];
  return {
    content: csvRows.join("\n"),
    extension: "csv",
    filename: `${buildFilename(viewName, filters)}.csv`,
    mime: "text/csv;charset=utf-8;",
  };
}

export function buildCxJsonExport(
  data: CxExportData,
  viewName: string,
  filters?: Record<string, string>
): CxExportFile | null {
  if (!data.length) return null;
  return {
    content: JSON.stringify(data, null, 2),
    extension: "json",
    filename: `${buildFilename(viewName, filters)}.json`,
    mime: "application/json",
  };
}

/**
 * The dashboard fetches a server page before local table filtering. These
 * actions deliberately retain that source-page projection and filename rather
 * than claiming they export the table's local view.
 */
export function buildCxSourcePageExportConfig(
  data: CxExportData,
  viewName: string,
  filters?: Record<string, string>,
): CopyExportConfig {
  if (!data.length) return { items: [] };
  return {
    items: [
      {
        id: "source-page-csv",
        label: "CSV (source page)",
        build: () => {
          const file = buildCxCsvExport(data, viewName, filters);
          if (!file) throw new Error("There are no source-page rows to export.");
          return file;
        },
      },
      {
        id: "source-page-json",
        label: "JSON (source page)",
        build: () => {
          const file = buildCxJsonExport(data, viewName, filters);
          if (!file) throw new Error("There are no source-page rows to export.");
          return file;
        },
      },
    ],
  };
}

export function exportToCSV(
  data: CxExportData,
  viewName: string,
  filters?: Record<string, string>,
): void {
  const file = buildCxCsvExport(data, viewName, filters);
  if (!file) return;
  downloadBlob(new Blob([file.content], { type: file.mime }), file.filename);
}

export function exportToJSON(
  data: CxExportData,
  viewName: string,
  filters?: Record<string, string>,
): void {
  const file = buildCxJsonExport(data, viewName, filters);
  if (!file) return;
  downloadBlob(new Blob([file.content], { type: file.mime }), file.filename);
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
