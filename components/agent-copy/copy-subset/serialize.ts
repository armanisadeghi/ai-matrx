/**
 * copy-subset serialization — pure. The overlay previews and copies the SAME
 * text these functions produce; nothing here reads DOM, state, or the clock.
 */

import {
  buildAgentPayload,
  type AgentPayloadInput,
} from "@/components/agent-copy/buildAgentPayload";
import { approxTokens } from "@/components/agent-copy/clipboard";
import { formatFileSize } from "@ai-matrx/kit/format";
import {
  rowsToCsvFromColumns,
  rowsToMarkdownTable,
  rowsToRecordsFromColumns,
} from "@ai-matrx/design-system/data-table/copy-helpers";
import {
  toMatrxColumn,
  type CopySubsetColumn,
  type CopySubsetFormat,
  type CopySubsetMeta,
  type CopySubsetSource,
} from "@/components/agent-copy/copy-subset/types";

const INFER_SAMPLE_ROWS = 200;

/** One column per key seen across the first rows, in first-seen order. */
export function inferCopySubsetColumns<T>(rows: T[]): CopySubsetColumn<T>[] {
  const keys: string[] = [];
  const seen = new Set<string>();
  for (const row of rows.slice(0, INFER_SAMPLE_ROWS)) {
    if (row === null || typeof row !== "object") continue;
    for (const key of Object.keys(row as Record<string, unknown>)) {
      if (seen.has(key)) continue;
      seen.add(key);
      keys.push(key);
    }
  }
  return keys.map((key) => ({
    id: key,
    header: key,
    accessorFn: (row: T) => (row as Record<string, unknown>)[key],
  }));
}

/** Columns the source declares, or inferred ones when it declares none. */
export function resolveCopySubsetColumns<T>(
  columns: CopySubsetColumn<T>[] | undefined,
  rows: T[],
): CopySubsetColumn<T>[] {
  return columns && columns.length > 0 ? columns : inferCopySubsetColumns(rows);
}

/**
 * Serialization never drops a column: the shared row builders skip a column
 * with `filter === false` and no `accessorKey`, which is right for an
 * actions column in a live table and wrong for a column the user chose to
 * copy. So every column serializes as a plain value column.
 */
function toSerializationColumn<T>(column: CopySubsetColumn<T>) {
  return { ...toMatrxColumn(column), filter: "auto" as const };
}

/** The generic for-AI envelope used when a caller has no serializer. */
export function buildGenericCopySubsetInput<T>(
  source: Pick<CopySubsetSource<T>, "kind" | "location" | "label">,
  rows: T[],
  columns: CopySubsetColumn<T>[],
  meta: CopySubsetMeta,
): AgentPayloadInput {
  const matrxColumns = columns.map(toSerializationColumn);
  return {
    kind: source.kind,
    location: source.location,
    description: `${source.label}: ${meta.copied_rows} of ${meta.total_rows} ${meta.total_rows === 1 ? "row" : "rows"} across ${meta.copied_columns} of ${meta.total_columns} ${meta.total_columns === 1 ? "column" : "columns"}, shaped by the user before copying.`,
    data: rowsToRecordsFromColumns(rows, matrxColumns),
    summary: rowsToMarkdownTable(rows, matrxColumns),
    attributes: {
      total_rows: meta.total_rows,
      matched_rows: meta.matched_rows,
      copied_rows: meta.copied_rows,
      total_columns: meta.total_columns,
      copied_columns: meta.copied_columns,
      search: meta.search || undefined,
      active_filters: meta.active_filters,
      sort: meta.sort || undefined,
      selection: meta.selection,
    },
    context: {
      instruction:
        "The user filtered, sorted, and chose these rows and columns deliberately. Treat the subset as complete for their question; the attributes say how much was left out.",
    },
  };
}

/** The exact text the overlay copies for a format. */
export function serializeCopySubset<T>(
  source: Pick<
    CopySubsetSource<T>,
    "kind" | "location" | "label" | "serializer"
  >,
  rows: T[],
  columns: CopySubsetColumn<T>[],
  format: CopySubsetFormat,
  meta: CopySubsetMeta,
): string {
  const matrxColumns = columns.map(toSerializationColumn);
  switch (format) {
    case "markdown":
      return rowsToMarkdownTable(rows, matrxColumns);
    case "csv":
      return rowsToCsvFromColumns(rows, matrxColumns);
    case "json":
      return JSON.stringify(rowsToRecordsFromColumns(rows, matrxColumns), null, 2);
    case "ai": {
      const input = source.serializer
        ? source.serializer(rows, columns, meta)
        : buildGenericCopySubsetInput(source, rows, columns, meta);
      return buildAgentPayload(input);
    }
  }
}

export interface CopySubsetSize {
  chars: number;
  bytes: number;
  tokens: number;
  /** "12.3 KB". */
  bytesLabel: string;
}

/** UTF-8 byte length without TextEncoder (absent under jsdom). */
export function utf8ByteLength(text: string): number {
  let bytes = 0;
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    bytes += code < 0x80 ? 1 : code < 0x800 ? 2 : code < 0x10000 ? 3 : 4;
  }
  return bytes;
}

export function copySubsetSize(text: string): CopySubsetSize {
  const bytes = utf8ByteLength(text);
  return {
    chars: text.length,
    bytes,
    tokens: approxTokens(text),
    bytesLabel: formatFileSize(bytes),
  };
}
