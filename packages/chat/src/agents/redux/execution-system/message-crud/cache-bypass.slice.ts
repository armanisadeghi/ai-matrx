/**
 * cache-bypass slice — one-shot `cache_bypass` flags per conversation.
 *
 * Problem: After direct cx_message / cx_tool_call / cx_media writes (edits,
 * forks, deletes), the server's agent cache for that conversation is stale.
 * The next outbound AI request MUST carry `cache_bypass.conversation = true`
 * so the server rebuilds from the DB. Forgetting it silently delivers
 * pre-edit content to the model.
 *
 * This slice tracks "needs a conversation-level bust on the next outbound
 * call" per conversationId. The execute thunks read & clear the flag
 * atomically before firing the request — one-shot guarantee:
 *   • CRUD thunk marks the conversation  → `markCacheBypass({ conversationId, conversation: true })`
 *   • Next outbound call reads + clears  → `consumePendingCacheBypass(cid)` returns the flags AND clears them
 *
 * Also supports agent/tools/models buckets for future extension; every
 * CRUD thunk that mutates those surfaces can mark the bucket it affects.
 */

import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

// =============================================================================
// Types — mirror the server's CacheBypass schema
// =============================================================================

export interface CacheBypassFlags {
  conversation: boolean;
  agent: boolean;
  tools: boolean;
  models: boolean;
}

export interface CacheBypassState {
  /** Per-conversation pending bust flags. Absent = no bust needed. */
  byConversationId: Record<string, CacheBypassFlags>;
}

const initialState: CacheBypassState = {
  byConversationId: {},
};

const EMPTY_FLAGS: CacheBypassFlags = {
  conversation: false,
  agent: false,
  tools: false,
  models: false,
};

// =============================================================================
// Slice
// =============================================================================

const cacheBypassSlice = createSlice({
  name: "cacheBypass",
  initialState,
  reducers: {
    /**
     * OR-in a set of bust flags for a conversation. Existing flags stay set;
     * the union is what eventually ships on the next request. Call this from
     * any CRUD thunk that writes to the DB outside the agent pipeline.
     */
    markCacheBypass(
      state,
      action: PayloadAction<
        { conversationId: string } & Partial<CacheBypassFlags>
      >,
    ) {
      const { conversationId, ...flags } = action.payload;
      const existing = state.byConversationId[conversationId] ?? {
        ...EMPTY_FLAGS,
      };
      state.byConversationId[conversationId] = {
        conversation: existing.conversation || flags.conversation === true,
        agent: existing.agent || flags.agent === true,
        tools: existing.tools || flags.tools === true,
        models: existing.models || flags.models === true,
      };
    },

    /** Clear any pending bust flags for a conversation (consumed). */
    clearCacheBypass(state, action: PayloadAction<string>) {
      delete state.byConversationId[action.payload];
    },

    /** Clear a specific bucket without touching the others. */
    clearCacheBypassBucket(
      state,
      action: PayloadAction<{
        conversationId: string;
        bucket: keyof CacheBypassFlags;
      }>,
    ) {
      const { conversationId, bucket } = action.payload;
      const existing = state.byConversationId[conversationId];
      if (!existing) return;
      existing[bucket] = false;
      // Prune the entry entirely if all buckets are cleared.
      if (
        !existing.conversation &&
        !existing.agent &&
        !existing.tools &&
        !existing.models
      ) {
        delete state.byConversationId[conversationId];
      }
    },
  },
});

export const { markCacheBypass, clearCacheBypass, clearCacheBypassBucket } =
  cacheBypassSlice.actions;
export const cacheBypassReducer = cacheBypassSlice.reducer;
export default cacheBypassSlice.reducer;

// =============================================================================
// Selectors
// =============================================================================

type WithCacheBypass = { cacheBypass: CacheBypassState };

export const selectPendingCacheBypass =
  (conversationId: string) =>
  (state: WithCacheBypass): CacheBypassFlags | null =>
    state.cacheBypass?.byConversationId?.[conversationId] ?? null;

/**
 * Thunk-style consumer: reads the pending flags and clears them atomically.
 * Use ONLY from execute/launch paths that are about to fire an outbound
 * request. Returns `null` when no bust is needed.
 */
export function consumePendingCacheBypass(
  conversationId: string,
): (
  dispatch: (action: unknown) => unknown,
  getState: () => WithCacheBypass,
) => CacheBypassFlags | null {
  return (dispatch, getState) => {
    const state = getState();
    const flags = state.cacheBypass?.byConversationId?.[conversationId] ?? null;
    if (!flags) return null;
    dispatch(clearCacheBypass(conversationId));
    return flags;
  };
}
