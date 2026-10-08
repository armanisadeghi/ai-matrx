/**
 * The version chain, owner rows only.
 *
 * `canvas.canvas_items.parent_canvas_id` carried no owner check: insert RLS only
 * checks the row's OWN `user_id`, so anyone could insert their own row into
 * another person's chain at any version. Such a row is not a version of the
 * item — every real save path (`cx_canvas_save_user_version`,
 * `cx_canvas_update_version` for the owner) writes the chain root owner's rows.
 *
 * The database guard (`canvas_items_version_chain_same_owner`, a composite FK
 * `(user_id, parent_canvas_id) → (user_id, id)`) refuses new planted rows once it
 * is live; until then — and for any row planted before it — every chain read
 * passes through here. Mirrors the server resolver
 * (`aidream/services/conversation_context/canvas_sources.py`).
 *
 * The owner is the chain ROOT's owner (the row with no parent). When the root is
 * not in the rows (RLS hid it), the requested row's owner stands in. When no
 * owner is knowable (the rows carry no `user_id`), the rows are returned as
 * read — there is nothing to compare, and dropping them would hide the item.
 */
export interface ChainRow {
  id: string;
  parent_canvas_id: string | null;
  user_id?: string | null;
}

/**
 * A row's place in its version chain. `chain_version` is assigned once at INSERT;
 * `version` is the row-revision token every UPDATE bumps (a v1 relinked to its
 * page reads `version` 4 while v2 reads 2), so `version` never orders a chain.
 * Rows read without the column (narrow selects) fall back to `version`.
 */
export function chainVersionOf(row: { chain_version?: number | null; version?: number | null }): number {
  return row.chain_version ?? row.version ?? 1;
}

/** The newest version among chain rows (highest `chain_version`), or null. */
export function latestChainRow<T extends { chain_version?: number | null; version?: number | null }>(
  rows: readonly T[],
): T | null {
  let latest: T | null = null;
  for (const row of rows) if (!latest || chainVersionOf(row) > chainVersionOf(latest)) latest = row;
  return latest;
}

export function chainOwnerRowsOnly<T extends ChainRow>(rows: T[], requestedId?: string): T[] {
  if (rows.length === 0) return rows;
  const root = rows.find((row) => row.parent_canvas_id === null);
  const requested = requestedId ? rows.find((row) => row.id === requestedId) : undefined;
  const owner = root?.user_id ?? requested?.user_id;
  if (!owner) return rows;
  return rows.filter((row) => row.user_id === owner);
}
