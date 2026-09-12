/**
 * copy-subset — "Filter & sort before copying…"
 *
 * The platform primitive behind every Copy-for-AI control's door into an
 * isolated table where the user shapes EXACTLY the rows and columns they want
 * (search, per-column + layered filters, sort, column show/hide, row
 * selection), watches the live count and size, picks a format, and copies.
 * The origin surface never shares state with it: the session holds its own
 * copy of the row array and its own query state, and the overlay only reads.
 *
 * A caller passes any array of row objects — a table, a card list, a report,
 * or a surface with no tabular layout at all — plus optional column
 * definitions and the "for AI" serializer it already uses.
 *
 * Working label (no canonical vocabulary term exists — flagged to Arman):
 * "copy-subset". Files: `components/agent-copy/copy-subset/`.
 */

import type { AgentPayloadInput } from "@/components/agent-copy/buildAgentPayload";
import type {
  ColumnFilterKind,
  MatrxColumnDef,
  MatrxDataTableQueryState,
} from "@ai-matrx/design-system/data-table/types";

/** Output formats. `ai` = the caller's existing for-AI serialization. */
export type CopySubsetFormat = "ai" | "markdown" | "csv" | "json";

export const COPY_SUBSET_FORMATS: ReadonlyArray<{
  id: CopySubsetFormat;
  label: string;
}> = [
  { id: "ai", label: "For AI" },
  { id: "markdown", label: "Markdown" },
  { id: "csv", label: "CSV" },
  { id: "json", label: "JSON" },
];

/**
 * A column the overlay's table can show, sort, and filter. Deliberately the
 * canonical `MatrxColumnDef` minus renderers: the primitive renders cells
 * itself so the copied text and the previewed text are the same text.
 */
export interface CopySubsetColumn<T> {
  /** Stable id (sort/filter/visibility key). */
  id: string;
  /** Header text — also the Markdown/CSV header and the JSON record key. */
  header: string;
  /** Value for sort/filter/serialization. One of these is required. */
  accessorKey?: keyof T & string;
  accessorFn?: (row: T) => unknown;
  /** Filter kind. Default `"auto"`. */
  filter?: ColumnFilterKind;
  /** Start hidden (the user can reveal it in the column chooser). */
  hidden?: boolean;
}

/**
 * What a caller hands the primitive. An array is snapshotted at registration;
 * a loader runs when the window opens (loading / error / retry are the
 * window's job) and its result is snapshotted then.
 *
 * THE SHALLOW-COPY LAW: the snapshot is a fresh ARRAY; the row objects are
 * shared with the origin. Nothing in copy-subset may mutate a row — the
 * window never enables inline editing on its table.
 */
export interface CopySubsetSource<T> {
  /** Toast / title label, e.g. "OpenAI models" or "Tool re-fetch report". */
  label: string;
  /** Where the user is, in words (buildAgentPayload `location`). */
  location: string;
  /** Root xml tag for the generic for-AI envelope, e.g. "provider-sync-models". */
  kind: string;
  rows: T[] | (() => Promise<T[]>);
  /**
   * Column definitions. Omit to infer one column per key seen across the
   * first rows (header = key).
   */
  columns?: CopySubsetColumn<T>[];
  /**
   * Stable row identity for selection. Omit for rows with no id — the
   * session then keys rows by their index in the snapshot.
   */
  getRowId?: (row: T) => string;
  /**
   * The for-AI serialization the caller already uses. Receives the shaped
   * rows and the visible columns; returns the envelope input. Omit for the
   * generic envelope (records + a Markdown summary + shaping attributes).
   */
  serializer?: (
    rows: T[],
    columns: CopySubsetColumn<T>[],
    meta: CopySubsetMeta,
  ) => AgentPayloadInput;
  /** Rows pre-selected when the overlay opens (ids from `getRowId`). */
  initialSelectedIds?: string[];
  /** Format the overlay opens on. Default `"ai"`. */
  defaultFormat?: CopySubsetFormat;
  /** Fired after a successful clipboard write. */
  onCopied?: (result: CopySubsetResult) => void;
}

/** How the subset was shaped — carried into the payload attributes. */
export interface CopySubsetMeta {
  format: CopySubsetFormat;
  total_rows: number;
  /** Rows after search/filters (before the selection restriction). */
  matched_rows: number;
  /** Rows actually copied. */
  copied_rows: number;
  total_columns: number;
  copied_columns: number;
  search?: string;
  active_filters: number;
  sort?: string;
  /** True when the copied rows are a checkbox selection, not the whole match. */
  selection: boolean;
}

export interface CopySubsetResult {
  text: string;
  meta: CopySubsetMeta;
}

/** Overlay-local state: the query the user shapes plus their choices. */
export interface CopySubsetState {
  query: MatrxDataTableQueryState;
  /** Ids (getRowId) of hidden columns. */
  hiddenColumnIds: string[];
  /** Row ids ticked in the overlay's own selection. Empty = every match. */
  selectedRowIds: string[];
  format: CopySubsetFormat;
}

/** Convert a subset column into a canonical table column for MatrxDataTable. */
export function toMatrxColumn<T>(
  column: CopySubsetColumn<T>,
): MatrxColumnDef<T> {
  return {
    id: column.id,
    header: column.header,
    accessorKey: column.accessorKey,
    accessorFn: column.accessorFn,
    filter: column.filter ?? "auto",
  };
}
