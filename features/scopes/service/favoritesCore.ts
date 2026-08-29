// features/scopes/service/favoritesCore.ts
//
// The client-injectable half of the favorites chokepoint. `favoritesService.ts`
// is a `"use client"` module bound to the browser Supabase singleton, so
// SERVER-side readers (e.g. `features/ai-work/service/providerConversation.ts`,
// which runs in a Server Component with the server Supabase client) could not
// reach it — and the one that tried instead called `ues_get_bulk` bare, the
// only `assoc_*`/`cat_*`/`ues_*` caller outside `features/scopes/service/`
// (associations extraction W0-P3, 2026-08-29).
//
// This file fixes that WITHOUT opening a second RPC path: the `ues_get_bulk`
// call + row mapping live HERE, the Supabase client is INJECTED (browser or
// server), and `favoritesService.getBulk` delegates to it. Together with
// `favoritesService.ts` these two files ARE the sole `ues_*` chokepoint —
// no other file may call those RPCs. Same result contract: returns a
// `ScopesRpcResult`, NEVER throws.
//
// NO "use client" here, deliberately: pure TypeScript, safe in any graph.

import {
  err,
  mapPgError,
  mapPgErrorPair,
  ok,
} from "@/features/scopes/service/rpcResult";
import type { ScopesRpcResult, UserEntityState } from "@/features/scopes/types";

// Raw `ues_get_bulk` row (snake_case, straight from PG). No `entity_type` —
// it's a query input the RPC doesn't echo.
interface UesBulkRow {
  entity_id: string;
  is_favorite: boolean;
  is_pinned: boolean;
  is_hidden: boolean;
  last_viewed_at: string | null;
}

/**
 * The minimal structural client this core needs — satisfied by BOTH the
 * browser singleton (`@/utils/supabase/client`) and the per-request server
 * client (`@/utils/supabase/server`). Injection instead of a singleton import
 * is what lets one implementation serve both runtimes (and mirrors the
 * `@ai-matrx/associations` dataSource port this unit is extracting toward).
 */
export interface UesGetBulkClient {
  rpc(
    fn: "ues_get_bulk",
    args: { p_entity_type: string; p_entity_ids: string[] },
  ): PromiseLike<{ data: unknown; error: unknown }>;
}

/**
 * Bulk-fetch the caller's flags for `entityIds` of one `entityType` — the
 * read a list view uses to paint its star column in one round-trip. Only
 * entities that HAVE a state row come back; absent ids mean "no state yet".
 *
 * Auth is the RPC's own `auth.uid()` gate — the injected client carries the
 * session (browser singleton or server cookie client). The browser-side
 * `favoritesService.getBulk` adds its usual `requireUserId()` preflight
 * before delegating here.
 */
export async function uesGetBulk(
  client: UesGetBulkClient,
  entityType: string,
  entityIds: string[],
): Promise<ScopesRpcResult<{ items: UserEntityState[] }>> {
  try {
    const ids = Array.from(new Set(entityIds));
    const { data, error } = await client.rpc("ues_get_bulk", {
      p_entity_type: entityType,
      p_entity_ids: ids,
    });
    if (error) return err(...mapPgErrorPair(error));
    const rows = (Array.isArray(data) ? data : []) as UesBulkRow[];
    // `ues_get_bulk` doesn't echo entity_type (it's a query input) — stamp
    // it back so callers get the same `UserEntityState` shape as `list`.
    return ok({
      items: rows.map((r) => ({
        entityType,
        entityId: r.entity_id,
        isFavorite: r.is_favorite,
        isPinned: r.is_pinned,
        isHidden: r.is_hidden,
        lastViewedAt: r.last_viewed_at ?? null,
      })),
    });
  } catch (e) {
    return { ok: false, error: mapPgError(e) };
  }
}
