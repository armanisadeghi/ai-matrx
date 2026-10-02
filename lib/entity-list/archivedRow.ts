// lib/entity-list/archivedRow.ts
//
// An archived or deleted row is read-only in every list: its cells take no
// inline edit and its menu offers no "Edit row" (MatrxDataTable's per-row
// `editableIf` gates both). Before this, a deleted board still showed the
// rename pencil and Edit row, and the save was then refused (2026-10-02).
// Read from the row's own lifecycle fields, whatever the list calls them.

/** True when the row says it is archived or deleted. */
export function isArchivedRow(row: unknown): boolean {
  if (typeof row !== "object" || row === null) return false;
  const r = row as Record<string, unknown>;
  return (
    r.archived === true ||
    r.is_archived === true ||
    r.isArchived === true ||
    (r.deleted_at !== undefined && r.deleted_at !== null) ||
    (r.deletedAt !== undefined && r.deletedAt !== null) ||
    (r.archived_at !== undefined && r.archived_at !== null)
  );
}

/** A column that takes inline edit refuses it on archived rows (and keeps its own gate). */
export function withArchivedRowsReadOnly<C extends { editable?: unknown; editableIf?: (row: R) => boolean }, R>(
  column: C,
): C {
  if (!column.editable) return column;
  const own = column.editableIf;
  return { ...column, editableIf: (row: R) => !isArchivedRow(row) && (own?.(row) ?? true) };
}
