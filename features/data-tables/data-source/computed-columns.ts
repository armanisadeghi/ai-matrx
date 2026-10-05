// features/data-tables/data-source/computed-columns.ts — WHO WORKS A FORMULA OUT: THE STORE.
//
// A table's formula text goes to the store (`custom.formula_parse` via `field_update.formula_text`),
// the store works the value out on read (`custom.formula_eval`), and the value arrives in the row
// like any other cell. So this returns the rows AS READ — the browser computes nothing, and an
// agent, an export and a webhook see exactly the number the grid shows.

import { isComputedColumn, type ComputedColumnField, type ComputedRowsResult } from "@ai-matrx/design-system/formulas";

type Row = { id: string; data: Record<string, unknown>; created_at?: string; updated_at?: string };

type Compute = <R extends Row, F extends ComputedColumnField>(
  rows: readonly R[],
  fields: readonly F[],
  displayValueOf?: (fieldName: string, raw: unknown) => unknown,
) => ComputedRowsResult<R>;

/** Nothing to compute — the store already did. */
export const computeColumns: Compute = (rows, fields) => ({
  rows: rows as (typeof rows)[number][],
  errors: new Map(),
  // Every write path must still skip these: the store refuses a write to a
  // worked-out column by name, and the grid should never offer one.
  formulaFieldNames: new Set(fields.filter(isComputedColumn).map((f) => f.field_name)),
});
