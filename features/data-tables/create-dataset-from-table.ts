/**
 * createDatasetFromTable — create a NEW `udt_datasets` table from already-parsed
 * tabular data (headers + rows), in ONE place.
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

import { supabase } from "@/utils/supabase/client";
import {
  createTable,
  type FieldDefinition,
} from "@/utils/user-table-utls/table-utils";
import { sanitizeFieldName } from "@/utils/user-table-utls/field-name-sanitizer";
import { bulkWrite } from "./service";
import { isBulkOpError, isServiceFailure, type BulkOp } from "./types";

export interface CreateDatasetFromTableArgs {
  /** Display name for the new dataset (e.g. the artifact / conversation title). */
  name: string;
  description?: string;
  /** Display headers, column order preserved. */
  headers: string[];
  /** Rows keyed by display header (e.g. `ParsedTable.normalizedData`). */
  rows: Array<Record<string, unknown>>;
  isPublic?: boolean;
}

export type CreateDatasetResult =
  | { ok: true; tableId: string; inserted: number }
  | { ok: false; error: string };

export async function createDatasetFromTable(
  args: CreateDatasetFromTableArgs,
): Promise<CreateDatasetResult> {
  const { name, description, headers, rows, isPublic = false } = args;
  if (headers.length === 0) return { ok: false, error: "Table has no columns" };

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
      data_type: "string",
      field_order: index + 1,
      is_required: index === 0,
    };
  });

  const created = await createTable(supabase, {
    tableName: name.trim() || "Untitled table",
    description: description ?? "",
    isPublic,
    authenticatedRead: false,
    fields,
  });
  if (!created.success || !created.tableId) {
    return { ok: false, error: created.error ?? "Failed to create table" };
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

  if (operations.length === 0) return { ok: true, tableId, inserted: 0 };

  const writeResult = await bulkWrite({ tableId, operations });
  if (isServiceFailure(writeResult)) {
    // The dataset exists but rows failed — surface loudly (loud recovery).
    return { ok: false, error: writeResult.error };
  }
  const inserted = writeResult.data.results.filter(
    (r) => !isBulkOpError(r),
  ).length;
  return { ok: true, tableId, inserted };
}
