// features/scopes/service/favoritesCore.ts
//
// HOST WIRING (W5 swap, 2026-08-29): the client-INJECTABLE `ues_get_bulk`
// half — the one favorites read a SERVER component can run with its own
// per-request supabase client (browser callers use ./favoritesService,
// which rides the host store). The implementation is the package's
// favorites chokepoint (`createFavoritesService` in
// `@ai-matrx/associations/core`) constructed over the injected client.
//
// Auth semantics preserved from the pre-swap core: the injected client
// CARRIES the session and the RPC's own `auth.uid()` is the gate, so the
// identity port here is deliberately vacuous (it never throws) — an
// unauthenticated call fails loudly in Postgres, exactly as before.

import {
  createAssociationGuards,
  createEntityRegistry,
  createFavoritesService,
  createRpcResultHelpers,
} from "@ai-matrx/associations/core";
import type {
  AssociationsDataSource,
  ErrorSink,
} from "@ai-matrx/associations";
import type { ScopesRpcResult, UserEntityState } from "@/features/scopes/types";

/** Structural client contract — satisfied by both supabase singletons. */
export interface UesGetBulkClient {
  rpc(
    fn: "ues_get_bulk",
    args: { p_entity_type: string; p_entity_ids: string[] },
  ): PromiseLike<{ data: unknown; error: unknown }>;
}

// Server-safe scream seam: console only (the Error Inspector store is a
// browser buffer; server callers read their own logs).
const sink: ErrorSink = (event) => {
  console.error(`[associations:favoritesCore] ${event.code}: ${event.message}`, event.context);
};

/**
 * Bulk-fetch the caller's flags for `entityIds` of one `entityType` — the
 * read a list view uses to paint its star column in one round-trip. Only
 * entities that HAVE a state row come back; absent ids mean "no state yet".
 */
export async function uesGetBulk(
  client: UesGetBulkClient,
  entityType: string,
  entityIds: string[],
): Promise<ScopesRpcResult<{ items: UserEntityState[] }>> {
  const favorites = createFavoritesService({
    dataSource: client as AssociationsDataSource,
    // Vacuous by design — see the header. The RPC's auth.uid() is the gate.
    identity: { requireUserId: () => "" },
    errorSink: sink,
    guards: createAssociationGuards(sink),
    rpc: createRpcResultHelpers(sink),
    registry: createEntityRegistry(sink),
  });
  return favorites.getBulk(entityType, entityIds);
}
