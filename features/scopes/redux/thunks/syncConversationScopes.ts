// features/scopes/redux/thunks/syncConversationScopes.ts
//
// Stamp the user's ACTIVE scope selections onto a conversation through the
// canonical platform association edge so later turns can resolve the selected
// scopes' context cells.
//
// Why this exists alongside `scope_ids` on the request body: the request field
// supplies the current turn, while the association edge durably records which
// scopes the conversation uses for later turns and filtering.
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
import { waitForConversationPersisted } from "@/features/agents/redux/execution-system/conversations/conversation-persistence";
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

    // A new conversation UUID is announced before the server's atomic turn
    // commit makes chat.conversation readable. Association authorization asks
    // iam.has_access(source), so writing during that window is correctly
    // refused as "editor access to source required". Use the same materialized
    // row barrier as route promotion and document-edge writes.
    const persisted = await waitForConversationPersisted(conversationId);
    if (!persisted) {
      console.error(
        "[scopes] syncConversationScopes skipped: conversation was not persisted",
        { conversationId, scopeIds: activeIds },
      );
      return;
    }

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
