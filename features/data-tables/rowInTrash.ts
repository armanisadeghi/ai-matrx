// features/data-tables/rowInTrash.ts
//
// An edit of a Data table row that is in Trash is an EXPECTED refusal, not a failure: the row was
// archived (from another tab, another person, an agent) and every writer says so in one sentence —
// "This row is in Trash. Restore it from Trash to edit it." (migration
// udt_dataset_rows_in_trash_refusals_and_trash_listing.sql). The single-row writers
// (udt_upsert_row / udt_upsert_cell) RAISE it with SQLSTATE 55000; udt_bulk_write answers a
// per-op `row_in_trash`. The screen already shows the sentence, so it is logged as information
// through lib/errors/expectedRefusal (`logFailure`), never console.error.

import { expectedRefusal } from "@/lib/errors/expectedRefusal";
import type { ServiceErr } from "./types";

export const ROW_IN_TRASH = "row_in_trash" as const;

/** SQLSTATE the single-row writers raise the Trash refusal with (object_not_in_prerequisite_state). */
const ROW_IN_TRASH_SQLSTATE = "55000";

/** True when a service failure is the store's "this row is in Trash" refusal. */
export function isRowInTrashRefusal(failure: ServiceErr): boolean {
  return failure.refusal?.sqlstate === ROW_IN_TRASH_SQLSTATE && failure.error.includes("in Trash");
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
