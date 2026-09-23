// features/data-tables/data-source/computed-columns.ts — WHO WORKS A FORMULA OUT.
//
// An older table's formula columns are worked out IN THE BROWSER by
// `formulas.ts` (`withComputedColumns`), exactly as they always were. A table the
// record store holds is different: its formula text went to the store
// (`custom.formula_parse` via `field_update.formula_text`), the store works the
// value out on read (`custom.formula_eval`), and the value arrives in the row
// like any other cell. So for those tables this returns the rows AS READ — the
// browser computes nothing, and an agent, an export and a webhook see exactly
// the number the grid shows.
//
// The two answers have one shape, so the grid's eight call sites ask
// `computedColumnsFor(tableId)` once and do not know which store they are on.

import { isComputedColumn, withComputedColumns, type ComputedColumnField, type ComputedRowsResult } from "../formulas";

import { recordStoreHomeOf } from "./table-home";

type Row = { id: string; data: Record<string, unknown>; created_at?: string; updated_at?: string };

type Compute = <R extends Row, F extends ComputedColumnField>(
  rows: readonly R[],
  fields: readonly F[],
  displayValueOf?: (fieldName: string, raw: unknown) => unknown,
) => ComputedRowsResult<R>;

/** The record store's answer: nothing to compute — the store already did. */
const readAsStored: Compute = (rows, fields) => ({
  rows: rows as (typeof rows)[number][],
  errors: new Map(),
  // Every write path must still skip these: the store refuses a write to a
  // worked-out column by name, and the grid should never offer one.
  formulaFieldNames: new Set(fields.filter(isComputedColumn).map((f) => f.field_name)),
});

export function computedColumnsFor(tableId: string | null | undefined): Compute {
  return recordStoreHomeOf(tableId) ? readAsStored : withComputedColumns;
}
