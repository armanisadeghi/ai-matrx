/**
 * createDatasetFromTable — create a NEW table from already-parsed tabular data
 * (headers + rows), in ONE place. Born through the data seam's `createTable`
 * (lane INTEG-CLIENTS): in the record store for an organization whose tables
 * moved, in the older store otherwise — and the rows follow it there.
 *
 * The chat table artifact's one-click "Convert to table", any "save this table
 * as a real dataset" caller, and (future) CSV/JSON imports share this — no
 * forked create logic. Mirrors the proven `SaveTableModal` create path
 * (`createTable` for the dataset + fields, then one atomic `bulkWrite` for rows)
 * but takes no user input, so callers can convert with a single click.
 *
 * See `features/data-tables/FEATURE.md` and `save-to-table.ts` (the
 * write-into-EXISTING-table sibling).
 */

import type { FieldDefinition } from "@/utils/user-table-utls/table-utils";
import { sanitizeFieldName } from "@/utils/user-table-utls/field-name-sanitizer";
import { bulkWrite, createTable } from "./service";
import { isBulkOpError, isServiceFailure, type BulkOp } from "./types";
import { resolveUniqueDatasetName } from "./resolve-unique-dataset-name";
import { inferDataType } from "@/utils/user-table-utls/type-inference";

export interface CreateDatasetFromTableArgs {
  /** Display name for the new dataset (e.g. the artifact / conversation title). */
  name: string;
  description?: string;
  /** Display headers, column order preserved. */
  headers: string[];
  /** Rows keyed by display header (e.g. `ParsedTable.normalizedData`). */
  rows: Array<Record<string, unknown>>;
  isPublic?: boolean;
  /** The organization the table belongs to; absent → the active one (`ensureOrgId` holds). */
  organizationId?: string | null;
}

/** Flat result (mirrors `SaveToTableResult`): `error`/`tableId` always accessible. */
export interface CreateDatasetResult {
  success: boolean;
  /** The new table's id (present on success; also on a rows-failed partial). */
  tableId?: string;
  inserted: number;
  error?: string;
}

export async function createDatasetFromTable(
  args: CreateDatasetFromTableArgs,
): Promise<CreateDatasetResult> {
  const { name, description, headers, rows, isPublic = false, organizationId = null } = args;
  if (headers.length === 0)
    return { success: false, inserted: 0, error: "Table has no columns" };

  // Build field defs from headers: sanitized + de-duplicated field_name, display
  // name = header, first column required (mirrors SaveTableModal.handleCreateNew).
  const usedFieldNames = new Set<string>();
  const headerToField = new Map<string, string>();
  const fields: FieldDefinition[] = headers.map((header, index) => {
    const base = sanitizeFieldName(header) || `column_${index + 1}`;
    let fieldName = base;
    let suffix = 1;
    while (usedFieldNames.has(fieldName)) fieldName = `${base}_${suffix++}`;
    usedFieldNames.add(fieldName);
    headerToField.set(header, fieldName);
    return {
      field_name: fieldName,
      display_name: header || `Column ${index + 1}`,
      data_type: columnTypeOf(rows.map((row) => row[header])),
      field_order: index + 1,
      is_required: index === 0,
    };
  });

  const uniqueName = await resolveUniqueDatasetName(
    name.trim() || "Untitled table",
  );

  const created = await createTable({
    tableName: uniqueName,
    description: description ?? "",
    isPublic,
    authenticatedRead: false,
    fields,
    organizationId,
  });
  if (!created.success || !created.tableId) {
    return {
      success: false,
      inserted: 0,
      error: created.error ?? "Failed to create table",
    };
  }
  const tableId = created.tableId;

  // Map each row (keyed by display header) → field_name and insert atomically.
  const operations: BulkOp[] = rows
    .map((row) => {
      const data: Record<string, unknown> = {};
      for (const [header, value] of Object.entries(row)) {
        const field = headerToField.get(header) ?? sanitizeFieldName(header);
        if (field) data[field] = value;
      }
      return data;
    })
    .filter((data) => Object.keys(data).length > 0)
    .map((data) => ({ op: "insert", data }));

  if (operations.length === 0) return { success: true, tableId, inserted: 0 };

  const writeResult = await bulkWrite({ tableId, operations });
  if (isServiceFailure(writeResult)) {
    // The dataset exists but rows failed — surface loudly (loud recovery).
    return { success: false, tableId, inserted: 0, error: writeResult.error };
  }
  const inserted = writeResult.data.results.filter(
    (r) => !isBulkOpError(r),
  ).length;
  return { success: true, tableId, inserted };
}

/**
 * A COLUMN IS TYPED BY WHAT EVERY ONE OF ITS VALUES IS (lane HANDOVER, 2026-09-28).
 *
 * A table saved from a chat answer came out all text: Cedar Ridge Physical Therapy's "Sets" (3, 3, 2)
 * could not be summed, charted or sorted as a number. A column is a number, a yes/no or a date only
 * when EVERY value in it reads as one (integers and decimals together are a number); one value that
 * does not ("10-15" among the Reps) keeps the whole column text, because a guess that loses a
 * person's words is worse than a text column. Blanks say nothing either way. The one reader of a
 * value's type is `inferDataType` (the CSV and JSON imports use it too).
 */
export function columnTypeOf(values: ReadonlyArray<unknown>): string {
  const seen = new Set<string>();
  for (const value of values) {
    if (value === null || value === undefined || String(value).trim() === "") continue;
    seen.add(inferDataType(value));
  }
  if (seen.size === 0) return "string";
  if ([...seen].every((t) => t === "integer")) return "integer";
  if ([...seen].every((t) => t === "integer" || t === "number")) return "number";
  if (seen.size === 1) {
    const only = [...seen][0]!;
    if (only === "boolean" || only === "date" || only === "datetime") return only;
  }
  return "string";
}
