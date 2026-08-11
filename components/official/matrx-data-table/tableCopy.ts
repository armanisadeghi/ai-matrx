import type { AgentPayloadInput } from "@/components/agent-copy/buildAgentPayload";
import type { MatrxColumnDef, MatrxDataTableCopyConfig } from "./types";
import { columnId, getCellValue, stringifyCellValue } from "./filter-engine";

/** Human markdown table of the current view (visible columns × rows). */
export function rowsToMarkdownTable<T>(
  rows: T[],
  columns: MatrxColumnDef<T>[],
): string {
  const cols = columns.filter((c) => c.filter !== false || c.accessorKey);
  if (cols.length === 0) return "";
  const headers = cols.map((c) => {
    if (typeof c.header === "string") return c.header;
    return columnId(c);
  });
  const lines = [
    `| ${headers.join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
  ];
  for (const row of rows) {
    const cells = cols.map((c) =>
      stringifyCellValue(getCellValue(row, c)).replace(/\|/g, "\\|"),
    );
    lines.push(`| ${cells.join(" | ")} |`);
  }
  return lines.join("\n");
}

export function buildRowAgentInput<T>(
  config: MatrxDataTableCopyConfig<T>,
  row: T,
): AgentPayloadInput {
  return {
    kind: config.rowKind,
    location: config.location,
    description: config.rowDescription ?? `One ${config.label} row.`,
    data: config.agentRow ? config.agentRow(row) : row,
    summary: config.humanRow(row),
    attributes: config.rowAttributes?.(row),
  };
}

export function buildViewAgentInput<T>(
  config: MatrxDataTableCopyConfig<T>,
  visible: T[],
  all: T[],
  meta?: {
    search?: string;
    searchMatchMode?: string;
    anyOf?: string;
    filterCount?: number;
    sort?: string | null;
  },
): AgentPayloadInput {
  return {
    kind: config.listKind,
    location: config.location,
    description:
      config.listDescription ??
      `${config.listLabel ?? config.label} — current filtered/sorted view.`,
    data: visible.map((r) => (config.agentRow ? config.agentRow(r) : r)),
    summary: visible.map((r) => config.humanRow(r)).join("\n---\n"),
    attributes: {
      visible_count: visible.length,
      total_count: all.length,
      search: meta?.search || undefined,
      search_match: meta?.search ? meta.searchMatchMode : undefined,
      any_of: meta?.anyOf || undefined,
      active_filters: meta?.filterCount ?? 0,
      sort: meta?.sort || undefined,
      ...config.listAttributes?.(visible, all),
    },
  };
}

/** CSV of the current view (visible columns × rows), for ExportMenu. */
export function rowsToCsvFromColumns<T>(
  rows: T[],
  columns: MatrxColumnDef<T>[],
): string {
  const cols = columns.filter((c) => c.filter !== false || c.accessorKey);
  const escape = (value: string) =>
    /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
  const lines = [
    cols
      .map((c) => escape(typeof c.header === "string" ? c.header : columnId(c)))
      .join(","),
  ];
  for (const row of rows) {
    lines.push(
      cols
        .map((c) => escape(stringifyCellValue(getCellValue(row, c))))
        .join(","),
    );
  }
  return lines.join("\n");
}

export function buildViewHuman<T>(
  config: MatrxDataTableCopyConfig<T>,
  visible: T[],
  columns: MatrxColumnDef<T>[],
): string {
  const md = rowsToMarkdownTable(visible, columns);
  const summaries = visible.map((r) => config.humanRow(r)).join("\n\n");
  return [
    `${config.listLabel ?? config.label} (${visible.length} rows)`,
    "",
    md,
    "",
    "---",
    "",
    summaries,
  ].join("\n");
}
