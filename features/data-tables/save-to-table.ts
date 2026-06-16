/**
 * Save-to-existing-table engine.
 *
 * One place that knows how to write incoming tabular data (from a markdown
 * table, a JSON block, etc.) into an EXISTING `udt_datasets` table. Handles:
 *   - creating new columns for incoming-only headers (opt-in by the caller)
 *   - shallow duplicate detection + skip/update on a chosen identifier column
 *   - atomic commit via the new `udt_bulk_write` RPC (one transaction)
 *
 * Callers compute the column reconciliation first (see `reconcile.ts`) and then
 * tell the engine which incoming-only columns to add and how to dedupe. This
 * keeps the engine UI-agnostic and the UI free of write logic.
 *
 * See `features/data-tables/FEATURE.md`.
 */
import { supabase } from "@/utils/supabase/client";
import type { Json } from "@/types/database.types";
import { addColumn } from "@/utils/user-table-utls/table-utils";
import { sanitizeFieldName } from "@/utils/user-table-utls/field-name-sanitizer";
import {
  isPaginatedDataRow,
  unwrapGetUserTableDataPaginatedRows,
} from "@/utils/user-tables-rpc";

import { bulkWrite } from "./service";
import { isBulkOpError, isServiceFailure, type BulkOp } from "./types";
import {
  findDuplicates,
  mapRowsToFields,
  SKIP,
  type DuplicateScan,
} from "./reconcile";

/** Cap on existing rows pulled for dedupe / replace. */
const EXISTING_ROW_FETCH_CAP = 10000;

export interface ExistingRow {
  id: string;
  data: Record<string, unknown>;
}

/**
 * Read every existing row for a table (capped). Returns `{ id, data }` shapes
 * keyed by field_name. Used for dedupe scans and full-table replace.
 */
export async function fetchExistingRows(
  tableId: string,
): Promise<ExistingRow[]> {
  const { data, error } = await supabase.rpc(
    "get_user_table_data_paginated_v2",
    {
      p_table_id: tableId,
      p_limit: EXISTING_ROW_FETCH_CAP,
      p_offset: 0,
      p_sort_field: null,
      p_sort_direction: "asc",
      p_search_term: null,
    },
  );
  if (error) throw error;
  const rows = unwrapGetUserTableDataPaginatedRows(data as unknown as Json);
  return rows.filter(isPaginatedDataRow);
}

export interface SaveToTableResult {
  success: boolean;
  error?: string;
  inserted: number;
  updated: number;
  skipped: number;
  failed: number;
  /** Number of new columns added to the target table. */
  columnsAdded: number;
}

function emptyResult(): SaveToTableResult {
  return {
    success: false,
    inserted: 0,
    updated: 0,
    skipped: 0,
    failed: 0,
    columnsAdded: 0,
  };
}

/**
 * Add the requested incoming-only headers as new string columns, extending the
 * `header -> field_name` mapping in place. Field names are sanitized and
 * de-duplicated against names already in use. Returns the count added, or
 * throws (so the caller aborts before any rows are written).
 */
async function addNewColumns(
  tableId: string,
  baseMapping: Record<string, string>,
  newColumns: string[],
): Promise<{ mapping: Record<string, string>; columnsAdded: number }> {
  const mapping: Record<string, string> = { ...baseMapping };
  const usedFieldNames = new Set(
    Object.values(baseMapping).filter((v) => v && v !== SKIP),
  );

  let columnsAdded = 0;
  for (let index = 0; index < newColumns.length; index++) {
    const header = newColumns[index];
    const base = sanitizeFieldName(header) || `column_${index + 1}`;
    let fieldName = base;
    let suffix = 1;
    while (usedFieldNames.has(fieldName)) {
      fieldName = `${base}_${suffix++}`;
    }

    const addResult = await addColumn(supabase, {
      tableId,
      fieldName,
      displayName: header,
      dataType: "string",
      isRequired: false,
    });
    if (!addResult.success) {
      throw new Error(addResult.error ?? `Failed to add column "${header}"`);
    }

    usedFieldNames.add(fieldName);
    mapping[header] = fieldName;
    columnsAdded++;
  }

  return { mapping, columnsAdded };
}

export interface AppendToTableArgs {
  tableId: string;
  /** Incoming rows keyed by display header. */
  rows: Record<string, unknown>[];
  /** header -> existing field_name (matched columns; from `reconcileColumns`). */
  mapping: Record<string, string>;
  /** Incoming-only headers to create as new columns (display name = header). */
  newColumns?: string[];
  /** Optional shallow duplicate handling. */
  dedupe?: {
    /** Existing field_name to match incoming rows against. */
    identifierField: string;
    /** What to do with incoming rows that collide with an existing row. */
    onDuplicate: "skip" | "update";
  };
}

/**
 * Append incoming rows to an existing table. New columns (if requested) are
 * created first, then rows are written in a single `udt_bulk_write`
 * transaction. Duplicates (when `dedupe` is set) are either skipped or merged
 * into the existing row.
 */
export async function appendToTable(
  args: AppendToTableArgs,
): Promise<SaveToTableResult> {
  const { tableId, rows, mapping: baseMapping, newColumns = [], dedupe } = args;
  const result = emptyResult();

  try {
    const { mapping, columnsAdded } = await addNewColumns(
      tableId,
      baseMapping,
      newColumns,
    );
    result.columnsAdded = columnsAdded;

    const mappedRows = mapRowsToFields(rows, mapping);

    let scan: DuplicateScan | null = null;
    if (dedupe) {
      const existing = await fetchExistingRows(tableId);
      scan = findDuplicates(mappedRows, existing, dedupe.identifierField);
    }

    const operations: BulkOp[] = [];
    const opKinds: ("insert" | "update")[] = [];

    mappedRows.forEach((row, index) => {
      if (Object.keys(row).length === 0) {
        result.skipped++;
        return;
      }
      if (scan?.duplicateIndexes.has(index)) {
        if (dedupe?.onDuplicate === "update") {
          const rowId = scan.collisionRowIdByIndex.get(index);
          if (rowId) {
            operations.push({ op: "merge", row_id: rowId, data: row });
            opKinds.push("update");
            return;
          }
        }
        result.skipped++;
        return;
      }
      operations.push({ op: "insert", data: row });
      opKinds.push("insert");
    });

    if (operations.length === 0) {
      result.success = true;
      return result;
    }

    const writeResult = await bulkWrite({ tableId, operations });
    if (isServiceFailure(writeResult)) {
      result.error = writeResult.error;
      return result;
    }

    writeResult.data.results.forEach((r, i) => {
      if (isBulkOpError(r)) result.failed++;
      else if (opKinds[i] === "update") result.updated++;
      else result.inserted++;
    });

    result.success = true;
    return result;
  } catch (err) {
    result.error =
      err instanceof Error ? err.message : "Failed to save to table";
    return result;
  }
}

export interface ReplaceTableArgs {
  tableId: string;
  /** Incoming rows keyed by display header. */
  rows: Record<string, unknown>[];
  /** header -> existing field_name (matched columns; from `reconcileColumns`). */
  mapping: Record<string, string>;
  /** Incoming-only headers to create as new columns (display name = header). */
  newColumns?: string[];
}

/**
 * Replace the entire contents of a table: delete every existing row and insert
 * the incoming rows, all in one `udt_bulk_write` transaction (deletes run
 * before inserts within the batch). New columns (if requested) are created
 * first. The caller is responsible for confirming this destructive action.
 */
export async function replaceTable(
  args: ReplaceTableArgs,
): Promise<SaveToTableResult> {
  const { tableId, rows, mapping: baseMapping, newColumns = [] } = args;
  const result = emptyResult();

  try {
    const { mapping, columnsAdded } = await addNewColumns(
      tableId,
      baseMapping,
      newColumns,
    );
    result.columnsAdded = columnsAdded;

    const mappedRows = mapRowsToFields(rows, mapping);
    const existing = await fetchExistingRows(tableId);

    const operations: BulkOp[] = [];
    const opKinds: ("insert" | "delete")[] = [];

    for (const row of existing) {
      operations.push({ op: "delete", row_id: row.id });
      opKinds.push("delete");
    }
    for (const row of mappedRows) {
      if (Object.keys(row).length === 0) {
        result.skipped++;
        continue;
      }
      operations.push({ op: "insert", data: row });
      opKinds.push("insert");
    }

    if (operations.length === 0) {
      result.success = true;
      return result;
    }

    const writeResult = await bulkWrite({ tableId, operations });
    if (isServiceFailure(writeResult)) {
      result.error = writeResult.error;
      return result;
    }

    writeResult.data.results.forEach((r, i) => {
      if (isBulkOpError(r)) result.failed++;
      else if (opKinds[i] === "insert") result.inserted++;
      // successful deletes are intentionally not counted
    });

    result.success = true;
    return result;
  } catch (err) {
    result.error =
      err instanceof Error ? err.message : "Failed to replace table";
    return result;
  }
}
