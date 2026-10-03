// features/unified-data/storeRecordCandidates.ts
//
// Candidate source for the `record` entity token (a record-store record) in the universal record
// picker ("Link a record…", the Linked section's +). The store's own search door,
// `custom.records_search`, answers across EVERY organization the person belongs to — the active
// organization is never passed (access-ladder: it is not a list filter) — and names each record by
// its table's title field. Registered on the entity-registry overlay as `listCandidates`; the
// generic candidate read cannot serve this token (`custom.record` has no title column: a record's
// name lives in its document).
//
// The door costs ~200–450 ms, so a single typed character is not sent: the picker already waits
// for a pause, and this answers a one-character search with nothing rather than a slow broad read.

import { createClient } from "@/utils/supabase/client";

export const STORE_RECORD_SEARCH_MIN_CHARS = 2;

export async function listStoreRecordCandidates(args: {
  search?: string;
  limit?: number;
}): Promise<{ ok: true; data: { id: string; title: string }[] } | { ok: false; error: string }> {
  const search = args.search?.trim() ?? "";
  if (search.length > 0 && search.length < STORE_RECORD_SEARCH_MIN_CHARS) return { ok: true, data: [] };
  try {
    const { data, error } = await createClient()
      .schema("custom")
      .rpc("records_search", { p_search: search, p_limit: args.limit ?? 25, p_offset: 0 });
    if (error) throw error;
    return {
      ok: true,
      // Two tables often hold a record of the same name ("UnitedHealthcare" in two choice
      // lists), so each row says which table it is in; the same words label the link.
      data: (data ?? []).map((row) => ({
        id: row.record_id,
        title: row.name ? `${row.name} · ${row.table_name}` : row.table_name,
      })),
    };
  } catch (err) {
    console.error("[listStoreRecordCandidates] failed", err);
    return { ok: false, error: err instanceof Error ? err.message : "Could not search records" };
  }
}
