// features/data-tables/rowInTrash.ts
//
// An edit of a Data table row that is in Trash is an EXPECTED refusal, not a failure: the row was
// archived (from another tab, another person, an agent) and every writer says so in one sentence —
// "This row is in Trash. Restore it from Trash to edit it." (migration
// udt_dataset_rows_in_trash_refusals_and_trash_listing.sql). The single-row writers
// (udt_upsert_row / udt_upsert_cell) raise it through workbench.udt_refuse_row_in_trash, which
// answers HTTP 409 with code `row_in_trash` (udt_row_in_trash_refusal_is_a_conflict.sql); before
// that migration they raised SQLSTATE 55000 (an HTTP 500). Both shapes are recognised while the
// switch lands. udt_bulk_write answers a per-op `row_in_trash`; update_data_row_in_user_table
// answers its own {success:false} envelope. The screen already shows the sentence, so it is logged as information
// through lib/errors/expectedRefusal (`logFailure`), never console.error.

import { expectedRefusal } from "@/lib/errors/expectedRefusal";
import type { ServiceErr } from "./types";

export const ROW_IN_TRASH = "row_in_trash" as const;

/**
 * The older shape: SQLSTATE 55000 (object_not_in_prerequisite_state), which PostgREST answered as
 * HTTP 500. Kept only until udt_row_in_trash_refusal_is_a_conflict.sql is on every database.
 */
const ROW_IN_TRASH_LEGACY_SQLSTATE = "55000";

/** True when a service failure is the store's "this row is in Trash" refusal (409 or the older 55000). */
export function isRowInTrashRefusal(failure: ServiceErr): boolean {
  const code = failure.refusal?.sqlstate;
  if (code === ROW_IN_TRASH) return true;
  return code === ROW_IN_TRASH_LEGACY_SQLSTATE && failure.error.includes("in Trash");
}

/**
 * The Error to throw for a failed row write: the Trash refusal carries the expected-refusal code
 * (so `logFailure` records it as information); anything else is a plain Error with the store's
 * sentence. The message is the store's sentence either way — it is what the screen shows.
 */
export function rowWriteError(failure: ServiceErr): Error {
  return isRowInTrashRefusal(failure)
    ? expectedRefusal(ROW_IN_TRASH, failure.error)
    : new Error(failure.error);
}

/**
 * Throw `rowWriteError(failure)`. A function, not a `throw` statement at the call site: the React
 * Compiler skips a whole component that has a `throw` inside `try` (check:compiler-skips), and a
 * skipped UserTableViewer loses its memoisation and re-renders itself into "Maximum update depth".
 */
export function throwRowWriteError(failure: ServiceErr): never {
  throw rowWriteError(failure);
}
