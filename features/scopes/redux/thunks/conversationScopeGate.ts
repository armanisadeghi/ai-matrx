// features/scopes/redux/thunks/conversationScopeGate.ts
//
// Pre-send chat↔scope "ask on mismatch" gate. A conversation carries its
// scopes durably (ctx_scope_assignments tags — like a coding agent's
// attached repos); the agent must always be in-context for what the chat
// is about. When the user's sidebar (active) selection differs from the
// chat's tags, we ALWAYS ask — switch / combine / keep — and NEVER
// silently retag or silently drop.
//
// Called by `smartExecute` BEFORE `markInputSubmitted` (same placement as
// the sandbox gate) so a cancel leaves the composer text exactly as typed.
// Decision logic is pure (features/scopes/utils/scopeMismatch.ts); the
// dialog is the imperative ScopeMismatchDialogHost.
//
// Invariant note (FEATURE.md "Global vs local"): a dialog choice writes
// ENTITY tags (setEntityScopes, replace semantics) — never appContextSlice.
// The sidebar's active selection is untouched regardless of choice.

import type { ThunkAction, UnknownAction } from "@reduxjs/toolkit";
import { promptScopeMismatch } from "@/components/dialogs/scope-mismatch/scopeMismatchOpener";
import { selectActiveScopeIds } from "@/features/scopes/redux/selectors/active-context";
import {
  ensureEntityScopes,
  entityScopesKey,
} from "@/features/scopes/redux/thunks/ensureEntityScopes";
import { ensureScopeTree } from "@/features/scopes/redux/thunks/ensureScopeTree";
import { setEntityScopes } from "@/features/scopes/redux/thunks/setEntityScopes";
import {
  buildScopeDisplayItems,
  evaluateScopeMismatchGate,
  resolveScopeMismatchTarget,
  sameScopeIdSet,
  scopeSetPairKey,
} from "@/features/scopes/utils/scopeMismatch";
import type { RootState } from "@/lib/redux/rootReducer";

type AppThunk<R = void> = ThunkAction<R, RootState, unknown, UnknownAction>;

// Per-conversation memory of the last answered (A, C) pair — the pair AS IT
// STANDS AFTER the user's choice. "Combine" and "keep" leave A ≠ C by
// design; without this, every subsequent send would re-open the dialog for
// a state the user already ruled on. Runtime-only (resets on reload —
// re-asking once per session for a still-mismatched pair is fine). Any
// change to either set produces a different key → re-ask. A cancel is
// deliberately NOT recorded (the user decided nothing).
const lastAnsweredPairByConversation = new Map<string, string>();

export type ConversationScopeGateResult =
  | { blocked: true }
  /**
   * Proceed with the send. When `scopeIdsOverride` is set, the gate has
   * already resolved this send's scope set (and written the chat's durable
   * tags where needed) — `executeInstance` must use it as the request's
   * `scope_ids` and SKIP the post-send union `syncConversationScopes`
   * (a union would re-add scopes the user just chose to drop).
   */
  | { blocked: false; scopeIdsOverride?: string[] };

/**
 * Evaluates A (active sidebar scope ids) vs C (the conversation's tagged
 * scope ids) and gates the send:
 *
 *   1. C = ∅ (new/untagged chat)  → proceed; the post-send union sync
 *      stamps A (existing mechanism, untouched).
 *   2. A = ∅, C ≠ ∅               → proceed with `scopeIdsOverride = C`;
 *      an empty sidebar never strips a chat's context.
 *   3. A ≠ ∅, C ≠ ∅, A ≠ C        → open the 3-way dialog. The choice
 *      becomes BOTH this send's scope_ids AND the chat's durable tags
 *      (replace semantics). Cancel/dismiss blocks the send.
 *   4. A = C                      → proceed as today.
 *
 * Never blocks on infrastructure failure: if the chat's tags can't be
 * fetched, it screams and proceeds (a broken RPC must not lock the
 * composer).
 */
export function ensureConversationScopesOrAsk(
  conversationId: string,
): AppThunk<Promise<ConversationScopeGateResult>> {
  return async (dispatch, getState) => {
    // Fetch (cached after first load) the chat's durable tags. A brand-new
    // conversation id simply has no assignment rows → C = ∅.
    await dispatch(ensureEntityScopes("conversation", conversationId));

    // Read BOTH sets from fresh store state after the await so the equality
    // check can't run against a stale snapshot.
    const state = getState();
    const activeIds = selectActiveScopeIds(state);
    const entry =
      state.scopesTree.entityScopesByKey[
        entityScopesKey("conversation", conversationId)
      ];
    if (entry?.status === "error") {
      // Loud, never blocking: without C we can't evaluate the mismatch —
      // fall back to today's behavior (send with A; post-send union sync).
      console.error(
        "[scopes] conversationScopeGate: could not load the chat's scope " +
          "tags — skipping the mismatch check for this send",
        { conversationId, error: entry.error },
      );
      return { blocked: false };
    }
    const chatIds = entry?.status === "ready" ? entry.scope_ids : [];

    const gate = evaluateScopeMismatchGate(activeIds, chatIds);
    if (gate.kind === "proceed") return { blocked: false };
    if (gate.kind === "use-chat") {
      return { blocked: false, scopeIdsOverride: gate.scopeIds };
    }

    // A ≠ C with both non-empty → ask, unless the user already answered for
    // exactly this pair in this conversation (see the memory above): then
    // honor the standing decision — the chat's tags ARE the chosen target.
    if (
      lastAnsweredPairByConversation.get(conversationId) ===
      scopeSetPairKey(activeIds, chatIds)
    ) {
      return { blocked: false, scopeIdsOverride: [...chatIds] };
    }

    // Resolve names via the scope tree (cached; the sidebar picker has
    // almost always loaded it already).
    await dispatch(ensureScopeTree());
    const organizations = getState().scopesTree.organizations;
    const choice = await promptScopeMismatch({
      current: buildScopeDisplayItems(activeIds, organizations),
      chat: buildScopeDisplayItems(chatIds, organizations),
    });
    if (choice === "cancel") return { blocked: true };

    const target = resolveScopeMismatchTarget(choice, activeIds, chatIds);

    // Record the pair as it stands AFTER this choice (A unchanged, C →
    // target) so the same state never re-asks in this conversation.
    lastAnsweredPairByConversation.set(
      conversationId,
      scopeSetPairKey(activeIds, target),
    );

    // Durably write the chosen set as the chat's tags (replace semantics) —
    // unless the target already equals the chat's tags ("keep", or a
    // combine/update that lands on C). The request-side override still
    // applies either way.
    if (!sameScopeIdSet(target, chatIds)) {
      const res = await dispatch(
        setEntityScopes({
          entityType: "conversation",
          entityId: conversationId,
          scopeIds: target,
        }),
      );
      if (!res.ok) {
        // Loud: the send proceeds with the chosen scope_ids, but the chat's
        // durable tags did NOT update — a real defect signal, not noise.
        console.error(
          "[scopes] conversationScopeGate: failed to write the chosen " +
            "scope set as the chat's tags",
          { conversationId, scopeIds: target, error: res.error },
        );
      }
    }

    return { blocked: false, scopeIdsOverride: target };
  };
}
