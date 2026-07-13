// features/rag/service/dataStoreCandidates.ts
//
// Candidate source for the `data_store` entity token in the association
// pickers. Lists through the Python API (`GET /rag/data-stores`, service-role
// pool with explicit user checks; same path as `useDataStores`) — NOT because
// of schema exposure (`rag.*` IS PostgREST-exposed as of 2026-06), but because
// the Python visibility clause (data_store_grants global/industry/org branches)
// is richer than the current rag RLS on `data_stores`: a direct supabase-js read
// would return FEWER stores wherever sharing/grants matter. A direct-read swap is
// viable only after per-table RLS parity (SEARCH_SYSTEM_HANDOFF.md PENDING #4).
// Registered on the entity-registry overlay as `listCandidates`, which every
// picker consults before the generic read.
//
// The endpoint has no search param — filter client-side (store counts are
// small; the list endpoint is already the app-wide pattern).

import { getJson } from "@/lib/python-client";
import type { components } from "@/types/python-generated/api-types";

// DERIVED from the generated OpenAPI contract (`GET /rag/data-stores` returns
// `UserDataStoreOut[]`) — never hand-mirrored. This module reads only a few
// fields; a backend rename still surfaces as a compile error after
// `pnpm sync-types` rather than a silent runtime drift.
type ApiDataStoreSummary = components["schemas"]["UserDataStoreOut"];

export async function listDataStoreCandidates(args: {
  search?: string;
  limit?: number;
}): Promise<
  | { ok: true; data: { id: string; title: string }[] }
  | { ok: false; error: string }
> {
  const { search, limit = 100 } = args;
  try {
    const { data } = await getJson<ApiDataStoreSummary[]>(
      "/rag/data-stores?include_inactive=false",
    );
    const needle = search?.trim().toLowerCase();
    const rows = (Array.isArray(data) ? data : [])
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
