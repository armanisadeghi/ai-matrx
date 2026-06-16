/**
 * Column reconciliation + shallow dedupe — pure, side-effect-free helpers.
 *
 * Used by the save-to-existing-table engine (`save-to-table.ts`) and the UI
 * that previews a save (the markdown `SaveTableModal`, the JSON
 * `AppendToTableDialog`). Nothing here touches Supabase — it operates on
 * already-fetched fields/rows so it stays trivially testable.
 *
 * See `features/data-tables/FEATURE.md` for architectural context.
 */
import { sanitizeFieldName } from "@/utils/user-table-utls/field-name-sanitizer";
import type { TableField } from "@/utils/user-table-utls/table-utils";

/** Special mapping value meaning "do not write this incoming column". */
export const SKIP = "__skip__";

/**
 * Auto-map incoming columns to existing table fields by trying, in order:
 *   1. exact match on field_name (sanitized incoming column name)
 *   2. case-insensitive match on display_name
 *   3. case-insensitive sanitized match on display_name
 *
 * Returns a map `{ incomingColumn -> table.field_name | SKIP }`.
 *
 * (Moved here from the JSON `AppendToTableDialog`'s local `autoMap` so both the
 * markdown and JSON save flows share one matcher.)
 */
export function autoMapColumns(
  incomingColumns: string[],
  fields: TableField[],
): Record<string, string> {
  const byFieldName = new Map(fields.map((f) => [f.field_name, f.field_name]));
  const byDisplayLower = new Map(
    fields.map((f) => [f.display_name.toLowerCase(), f.field_name]),
  );
  const bySanitizedDisplay = new Map(
    fields.map((f) => [sanitizeFieldName(f.display_name), f.field_name]),
  );

  const mapping: Record<string, string> = {};
  for (const col of incomingColumns) {
    const sanitized = sanitizeFieldName(col);
    if (byFieldName.has(sanitized)) {
      mapping[col] = byFieldName.get(sanitized)!;
      continue;
    }
    const lower = col.toLowerCase();
    if (byDisplayLower.has(lower)) {
      mapping[col] = byDisplayLower.get(lower)!;
      continue;
    }
    if (bySanitizedDisplay.has(sanitized)) {
      mapping[col] = bySanitizedDisplay.get(sanitized)!;
      continue;
    }
    mapping[col] = SKIP;
  }
  return mapping;
}

export interface MatchedColumn {
  /** The incoming column header/key. */
  header: string;
  /** The existing table field it maps to. */
  field: TableField;
}

export interface ColumnReconciliation {
  /** Incoming columns that map to an existing field. */
  matched: MatchedColumn[];
  /** Incoming columns with no existing field (would become new columns). */
  incomingOnly: string[];
  /** Existing fields that have no incoming column (left empty on insert). */
  tableOnly: TableField[];
  /**
   * Convenience map: incoming header -> existing field_name, for matched
   * columns only. Incoming-only headers are intentionally absent (the caller
   * decides whether to add them as new columns).
   */
  mapping: Record<string, string>;
}

/**
 * Diff incoming columns against an existing table's fields.
 *
 * @param incomingHeaders display headers/keys from the source data, in order
 * @param fields          the target table's existing fields
 */
export function reconcileColumns(
  incomingHeaders: string[],
  fields: TableField[],
): ColumnReconciliation {
  const autoMapping = autoMapColumns(incomingHeaders, fields);
  const fieldByName = new Map(fields.map((f) => [f.field_name, f]));

  const matched: MatchedColumn[] = [];
  const incomingOnly: string[] = [];
  const usedFieldNames = new Set<string>();
  const mapping: Record<string, string> = {};

  for (const header of incomingHeaders) {
    const target = autoMapping[header];
    if (target && target !== SKIP) {
      const field = fieldByName.get(target);
      if (field) {
        matched.push({ header, field });
        usedFieldNames.add(field.field_name);
        mapping[header] = field.field_name;
        continue;
      }
    }
    incomingOnly.push(header);
  }

  const tableOnly = fields.filter((f) => !usedFieldNames.has(f.field_name));

  return { matched, incomingOnly, tableOnly, mapping };
}

/**
 * Project incoming rows (keyed by display header) into row payloads keyed by
 * `field_name`, using a `header -> field_name` mapping. Headers mapping to
 * `SKIP`/empty, or absent from the mapping, are dropped.
 */
export function mapRowsToFields(
  rows: Record<string, unknown>[],
  mapping: Record<string, string>,
): Record<string, unknown>[] {
  const entries = Object.entries(mapping).filter(
    ([, target]) => target && target !== SKIP,
  );
  return rows.map((row) => {
    const payload: Record<string, unknown> = {};
    for (const [header, target] of entries) {
      if (header in row) payload[target] = row[header];
    }
    return payload;
  });
}

/** Normalize a cell value for case-insensitive, whitespace-tolerant matching. */
function normalizeKey(v: unknown): string {
  if (v === null || v === undefined) return "";
  return String(v).trim().toLowerCase();
}

export interface DuplicateScan {
  /** Indexes (into the mapped-rows array) that collide with an existing row. */
  duplicateIndexes: Set<number>;
  /** For each duplicate index, the existing row id it collides with. */
  collisionRowIdByIndex: Map<number, string>;
}

/**
 * Shallow duplicate detection: match incoming (already field-mapped) rows
 * against existing rows on a single identifier field. Blank identifier values
 * are never treated as duplicates (empty cells should not collapse together).
 *
 * @param mappedRows      incoming rows keyed by field_name
 * @param existingRows    existing rows ({ id, data }) keyed by field_name
 * @param identifierField the field_name to compare on
 */
export function findDuplicates(
  mappedRows: Record<string, unknown>[],
  existingRows: Array<{ id: string; data: Record<string, unknown> }>,
  identifierField: string,
): DuplicateScan {
  const existingByKey = new Map<string, string>();
  for (const row of existingRows) {
    const key = normalizeKey(row.data?.[identifierField]);
    if (key === "") continue;
    // First existing row wins for a given identifier value.
    if (!existingByKey.has(key)) existingByKey.set(key, row.id);
  }

  const duplicateIndexes = new Set<number>();
  const collisionRowIdByIndex = new Map<number, string>();
  mappedRows.forEach((row, index) => {
    const key = normalizeKey(row[identifierField]);
    if (key === "") return;
    const existingId = existingByKey.get(key);
    if (existingId) {
      duplicateIndexes.add(index);
      collisionRowIdByIndex.set(index, existingId);
    }
  });

  return { duplicateIndexes, collisionRowIdByIndex };
}
