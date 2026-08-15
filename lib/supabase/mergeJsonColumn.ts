/**
 * lib/supabase/mergeJsonColumn.ts — the platform primitive for "merge a value
 * into a row's JSONB column, from the browser, without losing a concurrent
 * writer's keys".
 *
 * Why this exists (FOUND_DEFECTS D151): persisting a paid AI result almost
 * always means read-modify-write on an existing jsonb column (`metadata`,
 * `dynamic_content`, `settings`) — that is a lost-update race the moment two
 * surfaces write different keys of the same object. Every feature that needed
 * it was about to hand-roll the same read → spread → write, so it is built ONCE
 * here on the canonical optimistic-concurrency contract
 * (`utils/supabase/guardedUpdate.ts` — CAS on the `version` column) with a
 * bounded re-read-and-remerge retry, because an append/merge is exactly the
 * conflict a caller can resolve automatically.
 *
 * This is NOT a second concurrency token or a second write path: it composes
 * `guardedUpdate`, and it never compares `updated_at`.
 *
 * Usage:
 *   await mergeJsonColumn<Row>({
 *     fetchCurrent: () =>
 *       db.from("study_session").select("id, version, metadata")
 *         .eq("id", sessionId).maybeSingle(),
 *     readColumn: (row) => row.metadata,
 *     merge: (current) => ({ ...current, coach_tips: [...prior, entry] }),
 *     applyUpdate: ({ value, expectedVersion, nextVersion }) =>
 *       db.from("study_session")
 *         .update({ metadata: value, version: nextVersion })
 *         .eq("id", sessionId).eq("version", expectedVersion)
 *         .select("id, version, metadata").maybeSingle(),
 *   });
 *
 * Never throws for a normal outcome — it returns a typed status so a persist
 * failure can be reported without taking down the surface that triggered it.
 */
import type { PostgrestError } from "@supabase/supabase-js";
import type { Json } from "@/types/database.types";
import { guardedUpdate, type VersionedRow } from "@/utils/supabase/guardedUpdate";

interface MaybeSingleResponse<Row> {
  data: Row | null;
  error: PostgrestError | null;
}

/** A jsonb object column's value, normalized — never null, never an array. */
export type JsonObject = Record<string, Json | undefined>;

export type MergeJsonColumnResult<Row extends VersionedRow> =
  | { status: "saved"; row: Row }
  /** The row is gone / not visible under RLS — nothing to merge into. */
  | { status: "not_found" }
  /** Every attempt lost the CAS race; the caller's value was NOT written. */
  | { status: "conflict" }
  /** A transport/PostgREST failure. The error is returned, never swallowed. */
  | { status: "error"; error: unknown };

export interface MergeJsonColumnArgs<Row extends VersionedRow> {
  /** Read the row by primary key — must select `version` and the json column. */
  fetchCurrent: () => PromiseLike<MaybeSingleResponse<Row>>;
  /** Pick the json column off a fetched row. */
  readColumn: (row: Row) => Json | null;
  /**
   * Produce the column's next value from its CURRENT value. Re-invoked on each
   * retry with freshly-read data, so it must be a pure function of `current`.
   */
  merge: (current: JsonObject) => JsonObject;
  /**
   * Run the guarded UPDATE: set the column to `value` plus `version: nextVersion`,
   * filtered by `.eq("version", expectedVersion)`, ending in `.select(...).maybeSingle()`.
   */
  applyUpdate: (next: {
    value: JsonObject;
    expectedVersion: number;
    nextVersion: number;
  }) => PromiseLike<MaybeSingleResponse<Row>>;
  /** How many CAS attempts before giving up. Default 3. */
  attempts?: number;
}

/** Normalize a jsonb column read to a plain object (null / array / scalar → {}). */
export function asJsonObject(value: Json | null | undefined): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as JsonObject;
}

export async function mergeJsonColumn<Row extends VersionedRow>(
  args: MergeJsonColumnArgs<Row>,
): Promise<MergeJsonColumnResult<Row>> {
  const attempts = Math.max(args.attempts ?? 3, 1);
  try {
    for (let attempt = 0; attempt < attempts; attempt++) {
      const current = await args.fetchCurrent();
      if (current.error) return { status: "error", error: current.error };
      if (!current.data) return { status: "not_found" };

      const next = args.merge(asJsonObject(args.readColumn(current.data)));
      const result = await guardedUpdate<Row>({
        expectedVersion: current.data.version,
        applyUpdate: ({ expectedVersion, nextVersion }) =>
          args.applyUpdate({ value: next, expectedVersion, nextVersion }),
        fetchCurrent: args.fetchCurrent,
      });
      if (result.status === "saved") return { status: "saved", row: result.row };
      if (result.status === "not_found") return { status: "not_found" };
      // Conflict: someone else wrote between our read and our write. Re-read and
      // re-merge — that is exactly what makes a merge safe to retry.
    }
    return { status: "conflict" };
  } catch (e) {
    return { status: "error", error: e };
  }
}
