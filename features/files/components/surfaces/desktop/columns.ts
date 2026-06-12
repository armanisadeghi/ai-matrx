/**
 * features/files/components/surfaces/desktop/columns.ts
 *
 * Column specs for the file table — labels, sort metadata, alignment, and
 * "is this column meaningful for folders" hints. The `FileTable` and
 * `FileTableRow` both walk this registry in lock-step so the header and
 * the body never get out of sync.
 *
 * Adding a new column?
 *   1. Extend `ColumnId` in features/files/types.ts.
 *   2. Add the spec here.
 *   3. Wire the header in `FileTable.tsx` (sort/filter/picker).
 *   4. Render the cell in `FileTableRow.tsx` (file + folder branches).
 *   5. Add it to `DEFAULT_VISIBLE_COLUMNS` if it should be on by default.
 */

import type { ColumnId, SortBy, VisibleColumns } from "@/features/files/types";
import { DEFAULT_VISIBLE_COLUMNS } from "@/features/files/types";

export interface ColumnSpec {
  id: ColumnId;
  label: string;
  /** Sort key for the column, or null when the column has no sort. */
  sortKey: SortBy | null;
  /**
   * Label for the dropdown's ascending / descending sort buttons. Tuned
   * per-column so dates say "Newest first", sizes say "Largest first",
   * etc., rather than the generic "A → Z".
   */
  ascLabel?: string;
  descLabel?: string;
  align?: "left" | "right";
  /**
   * True when the column is only meaningful for files. Folders show the
   * graceful em-dash placeholder in these columns instead.
   */
  fileOnly?: boolean;
}

export const COLUMN_SPECS: Record<ColumnId, ColumnSpec> = {
  name: { id: "name", label: "Name", sortKey: "name" },
  type: { id: "type", label: "Type", sortKey: "type" },
  extension: {
    id: "extension",
    label: "Ext",
    sortKey: "extension",
    fileOnly: true,
  },
  mime: { id: "mime", label: "MIME", sortKey: "mime", fileOnly: true },
  path: { id: "path", label: "Location", sortKey: "path" },
  owner: { id: "owner", label: "Owner", sortKey: "owner" },
  size: {
    id: "size",
    label: "Size",
    sortKey: "size",
    ascLabel: "Smallest first",
    descLabel: "Largest first",
    fileOnly: true,
  },
  version: {
    id: "version",
    label: "Ver",
    sortKey: "version",
    ascLabel: "Lowest first",
    descLabel: "Highest first",
    fileOnly: true,
  },
  updated_at: {
    id: "updated_at",
    label: "Modified",
    sortKey: "updated_at",
    ascLabel: "Oldest first",
    descLabel: "Newest first",
  },
  created_at: {
    id: "created_at",
    label: "Created",
    sortKey: "created_at",
    ascLabel: "Oldest first",
    descLabel: "Newest first",
  },
  access: { id: "access", label: "Access", sortKey: null },
  rag_status: {
    id: "rag_status",
    label: "RAG",
    // RAG status is a derived enum (Indexed / Not indexed / Checking),
    // and the column is meaningless for folders — keep it filter-only
    // so users don't accidentally interleave files by indexing state.
    sortKey: null,
    fileOnly: true,
  },
  context: {
    id: "context",
    label: "Context",
    // Amber = no context, green = assigned — click either to assign. The
    // signal that drives RAG/NER, so it ships visible by default. Populated
    // by ONE bulk query per visible page, never per-row probes.
    sortKey: null,
    fileOnly: true,
  },
};

/**
 * Stable left-to-right order for the file-table header. Always begins
 * with `name` (anchor column) and ends with `access` (the rightmost
 * status column). Hidden columns are skipped at render time.
 *
 * `rag_status` sits between `access` and the trailing column-settings
 * gear — it's a side-band signal users opt into, not core file metadata,
 * so it lives at the right edge.
 */
export const COLUMN_ORDER: ReadonlyArray<ColumnId> = [
  "name",
  "type",
  "extension",
  "mime",
  "path",
  "owner",
  "size",
  "version",
  "updated_at",
  "created_at",
  "access",
  "context",
  "rag_status",
];

export function visibleColumnIds(
  visible: VisibleColumns,
): ReadonlyArray<ColumnId> {
  // Fall back to the default for column ids a user's persisted map predates
  // (e.g. `context` added 2026-06) — otherwise new columns stay invisible
  // for every existing user.
  return COLUMN_ORDER.filter((id) => visible[id] ?? DEFAULT_VISIBLE_COLUMNS[id]);
}
