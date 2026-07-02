// features/scopes/redux/thunks/syncConversationScopes.ts
//
// Stamp the user's ACTIVE scope selections onto a conversation's
// ctx_scope_assignments tags so resolve_full_context delivers the selected
// scopes' context cells to the agent.
//
// Why this exists alongside `scope_ids` on the request body: the request
// field only takes effect once the aidream deploy that threads it lands;
// the entity tags are read by the already-live RPC, so tagging covers turn
// 2+ immediately. It also durably records which scopes a conversation was
// worked under (filterable later).
//
// Semantics: UNION, never replace. A scope the user deselects globally is
// NOT untagged — manual Surface B tags and earlier stamps are preserved
// (never destroy user data). Same-type collisions are the documented
// contradiction case: warn-not-block, resolved server-side by iteration
// order until the per-chat scope picker ships.
//
// Invariant note (FEATURE.md "Global vs local"): this writes ENTITY tags
// from global state — the allowed direction. It never writes appContextSlice.

import type { ThunkAction, UnknownAction } from "@reduxjs/toolkit";
import { selectScopeSelectionsContext } from "@/lib/redux/slices/appContextSlice";
import {
  ensureEntityScopes,
  entityScopesKey,
} from "@/features/scopes/redux/thunks/ensureEntityScopes";
import { setEntityScopes } from "@/features/scopes/redux/thunks/setEntityScopes";
import type { RootState } from "@/lib/redux/rootReducer";

type AppThunk<R = void> = ThunkAction<R, RootState, unknown, UnknownAction>;

export function syncConversationScopes(
  conversationId: string,
): AppThunk<Promise<void>> {
  return async (dispatch, getState) => {
    const selections = selectScopeSelectionsContext(getState());
    const activeIds = Object.values(selections).filter(
      (id): id is string => !!id,
    );
    if (activeIds.length === 0) return;

    // Existing tags (cached after first fetch; no-refetch).
    await dispatch(ensureEntityScopes("conversation", conversationId));
    const key = entityScopesKey("conversation", conversationId);
    const entry = getState().scopesTree.entityScopesByKey[key];
    const existing = entry?.status === "ready" ? entry.scope_ids : [];

    const union = Array.from(new Set([...existing, ...activeIds]));
    if (union.length === existing.length) return; // nothing new to stamp

    const res = await dispatch(
      setEntityScopes({
        entityType: "conversation",
        entityId: conversationId,
        scopeIds: union,
      }),
    );
    if (!res.ok) {
      // Loud: a failed stamp means the agent runs without the selected
      // scopes' context — that's a real defect signal, not noise.
      console.error("[scopes] syncConversationScopes failed", {
        conversationId,
        scopeIds: union,
        error: res.error,
      });
    }
  };
}
