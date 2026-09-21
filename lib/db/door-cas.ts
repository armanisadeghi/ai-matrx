/**
 * `doorCas` — the ONE adapter between a write DOOR and `guardedUpdate`.
 *
 * WHY IT EXISTS. `platform` and `iam` are not client-writable schemas (chair ruling,
 * VERIFIER-8 HIGH-3, 2026-09-21): every write goes through a `SECURITY DEFINER` door that
 * decides on the one ladder. The doors this campaign builds carry the compare-and-swap INSIDE
 * the database — they take `p_expected_version`, filter on it in their own UPDATE, and **return
 * NULL on a miss**. That is deliberately the same three-state answer `guardedUpdate` already
 * reads off a `.maybeSingle()`: a row means saved, `null` means the row moved (or is gone), an
 * error means something else entirely.
 *
 * So a caller moving from a base-table UPDATE to a door keeps its `guardedUpdate` — including
 * its `rebase` phantom-conflict recovery, which is the wall `rulebookRebase.ts` was written for
 * and which no door should be asked to re-implement. **The only thing that actually differs is
 * the TYPE**: PostgREST types an RPC's `data` as `Json`, because a function returning `jsonb`
 * tells the schema nothing about the row inside it, while `.maybeSingle()` on a table is typed
 * as that table's `Row`.
 *
 * This is that one line, written once and explained once, instead of a cast repeated at every
 * call site — which is how a cast stops being read and starts hiding a real mismatch.
 *
 *   applyUpdate: ({ expectedVersion }) =>
 *     doorCas<RulebookRow>(
 *       supabase.rpc("rulebook_save", { p_rulebook_id: id, p_expected_version: expectedVersion, … }),
 *     ),
 *
 * 🚨 IT NARROWS NOTHING AND CHECKS NOTHING. It is an adapter, not a validator: the caller still
 * parses what comes back (`parseRulebook`, a codec, a schema) exactly as it did when the row came
 * from the table. A door that returned the wrong shape would be a defect in the door, and this
 * file must never grow a "tolerant read" that hides one.
 */

/** The shape `guardedUpdate`'s `applyUpdate` and `fetchCurrent` must resolve to. */
export interface DoorCasResult<Row> {
  data: Row | null;
  error: { message: string; code?: string } | null;
}

/**
 * Adapt a door call to the `.maybeSingle()` shape `guardedUpdate` reads.
 *
 * `null` data is passed straight through, because that is the door's CAS MISS and the whole
 * reason the two contracts line up. An error is passed through untouched, so a caller's existing
 * error handling (a 23505 it re-slugs on, an `operationFailed` wrapper) keeps working.
 */
export async function doorCas<Row>(
  call: PromiseLike<{ data: unknown; error: { message: string; code?: string } | null }>,
): Promise<DoorCasResult<Row>> {
  const { data, error } = await call;
  if (error) return { data: null, error };
  return { data: (data ?? null) as Row | null, error: null };
}
