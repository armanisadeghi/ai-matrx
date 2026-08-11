/**
 * utils/supabase/guardedUpdate.ts — the platform optimistic-concurrency
 * contract for direct-Supabase writes.
 *
 * Cross-repo system-of-record:
 * /Users/armanisadeghi/code/common-docs/systems/optimistic-concurrency/FEATURE.md
 * — read it before touching this feature in ANY repo.
 *
 * The revision token is the canonical `version` int column (bumped by the
 * `platform._touch_row` trigger on every UPDATE). A guarded write is a
 * compare-and-swap: `.eq("version", expectedVersion)` on the UPDATE, then
 * classify 0 rows as conflict-vs-gone by re-reading the row. This helper owns
 * the classification and the typed result so every feature reports conflicts
 * the same way — it deliberately takes the two queries as callbacks because
 * each feature already has its own schema-scoped client, column list, and
 * narrowing filters (`.is("deleted_at", null)` etc.).
 *
 * Usage:
 *   const result = await guardedUpdate({
 *     expectedVersion: page.version,
 *     applyUpdate: ({ expectedVersion, nextVersion }) =>
 *       db.from("page")
 *         .update({ ...patch, version: nextVersion })
 *         .eq("id", pageId)
 *         .eq("version", expectedVersion)
 *         .select(PAGE_COLUMNS)
 *         .maybeSingle(),
 *     fetchCurrent: () =>
 *       db.from("page").select(PAGE_COLUMNS).eq("id", pageId).maybeSingle(),
 *   });
 *   switch (result.status) { "saved" | "conflict" | "not_found" ... }
 *
 * Rules (same as the server side):
 * - Opt-in per write. No expectedVersion in hand (the surface never read
 *   `version`)? Then the surface cannot opt in — fix the read first.
 * - SET `version: nextVersion` in the update payload: the trigger recomputes
 *   the identical value on canonical tables and it keeps the CAS sound on
 *   tables without the trigger.
 * - Never invent a second token (no updated_at comparisons in new code).
 * - On conflict, surface the merge/refresh choice to the user — never silently
 *   overwrite (`currentRow`/`currentVersion` are returned for exactly that).
 */
import type { PostgrestError } from "@supabase/supabase-js";

export interface VersionedRow {
  version: number;
}

export type GuardedUpdateResult<Row extends VersionedRow> =
  | { status: "saved"; row: Row }
  | { status: "conflict"; currentRow: Row; currentVersion: number }
  | { status: "not_found" };

interface MaybeSingleResponse<Row> {
  data: Row | null;
  error: PostgrestError | null;
}

export interface GuardedUpdateArgs<Row extends VersionedRow> {
  /** The `version` the edit was based on — from the read that fed the UI. */
  expectedVersion: number;
  /**
   * Run the UPDATE with `.eq("version", expectedVersion)` and
   * `version: nextVersion` in the payload, ending in `.select(...).maybeSingle()`.
   */
  applyUpdate: (guard: {
    expectedVersion: number;
    nextVersion: number;
  }) => PromiseLike<MaybeSingleResponse<Row>>;
  /** Re-read the row by primary key alone (no version filter), `.maybeSingle()`. */
  fetchCurrent: () => PromiseLike<MaybeSingleResponse<Row>>;
}

export async function guardedUpdate<Row extends VersionedRow>(
  args: GuardedUpdateArgs<Row>,
): Promise<GuardedUpdateResult<Row>> {
  const { expectedVersion, applyUpdate, fetchCurrent } = args;
  const updated = await applyUpdate({
    expectedVersion,
    nextVersion: expectedVersion + 1,
  });
  if (updated.error) throw updated.error;
  if (updated.data) return { status: "saved", row: updated.data };

  const current = await fetchCurrent();
  if (current.error) throw current.error;
  if (!current.data) return { status: "not_found" };
  return {
    status: "conflict",
    currentRow: current.data,
    currentVersion: current.data.version,
  };
}
