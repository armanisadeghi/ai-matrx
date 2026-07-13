// features/rag/service/dataStoreCandidates.ts
//
// Candidate source for the `data_store` entity token in the association
// pickers. Direct-to-Supabase: `rag.fn_list_user_data_stores` already
// replicates the full owner + org + library-grant visibility clause
// (identity from auth.uid() only), so there's no RLS-parity gap left — see
// features/rag/hooks/useDataStores.ts, which uses the same RPC.
// Registered on the entity-registry overlay as `listCandidates`, which every
// picker consults before the generic read.
//
// No search param on the RPC — filter client-side (store counts are small;
// this mirrors the app-wide pattern for this list).

import { createClient } from "@/utils/supabase/client";
import { ragDb } from "@/utils/supabase/ragDb";

interface RpcDataStoreSummary {
  id: string;
  name: string;
}

export async function listDataStoreCandidates(args: {
  search?: string;
  limit?: number;
}): Promise<
  | { ok: true; data: { id: string; title: string }[] }
  | { ok: false; error: string }
> {
  const { search, limit = 100 } = args;
  try {
    const supabase = createClient();
    const { data, error: rpcError } = await ragDb(supabase).rpc(
      "fn_list_user_data_stores",
      { p_include_inactive: false },
    );
    if (rpcError) throw rpcError;
    const needle = search?.trim().toLowerCase();
    const rows = ((data ?? []) as RpcDataStoreSummary[])
      .filter((s) => !needle || s.name.toLowerCase().includes(needle))
      .slice(0, limit)
      .map((s) => ({ id: s.id, title: s.name }));
    return { ok: true, data: rows };
  } catch (err) {
    const msg =
      err instanceof Error ? err.message : "Could not load data stores";
    console.error("[listDataStoreCandidates] failed", err);
    return { ok: false, error: msg };
  }
}
