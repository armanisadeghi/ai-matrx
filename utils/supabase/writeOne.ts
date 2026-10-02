/**
 * writeOne — THE single-record write that PROVES it landed.
 *
 * Lives in `@ai-matrx/data/db` (the incident, the two modes and the rules are
 * in that module's header); this path keeps every app importer unchanged and
 * `WriteDidNotLandError` one class for the app and `@ai-matrx/chat`.
 *
 * Guard: `pnpm check:single-record-writes` (scripts/check-single-record-writes.ts)
 * fails on a new single-record update/delete that judges success by error alone.
 */
export {
  BulkWriteError,
  tryWriteOne,
  writeFailureStatus,
  writeOne,
  writeOneRow,
  WriteDidNotLandError,
  type TryWriteOneResult,
  type WriteDidNotLandReason,
  type WriteOneAction,
  type WriteOneOptions,
  type WriteOneRowResult,
} from "@ai-matrx/data/db";
