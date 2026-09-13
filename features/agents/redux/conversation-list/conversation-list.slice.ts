/**
 * conversationList slice — unified list entity store.
 *
 * Replaces the parallel `cxConversations` (global sidebar) +
 * `agentConversations` (per-agent RPC cache) slices. Items live once in
 * `byConversationId`; view selectors project into global / per-agent lists.
 *
 * Keeping the merge in a single slice means:
 *   - Rename/delete optimistic updates fire once and every view sees them.
 *   - The entity store can be extended with scroll/sort/filter in one place.
 *   - The shared-package extraction (Phase 5) has a cleaner surface.
 */

import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type {
  ConversationListItem,
  ConversationListState,
  ConversationListLoadStatus,
} from "./conversation-list.types";

// Constants moved to conversation-list.types.ts to sidestep circular imports
// between selectors (which read `CONVERSATION_LIST_TTL_MS`) and the slice.
// Re-export here for consumers that were reaching into the slice module.
export {
  CONVERSATION_LIST_TTL_MS,
  CONVERSATION_LIST_PAGE_SIZE,
} from "./conversation-list.types";

// ── Initial state ────────────────────────────────────────────────────────────

const initialState: ConversationListState = {
  byConversationId: {},
  allConversationIds: [],
  globalStatus: "idle",
  globalError: null,
  globalLastFetchedAt: null,
  globalHasMore: false,
  agentCaches: {},
  trashConversationIds: [],
  trashByConversationId: {},
  trashStatus: "idle",
  trashError: null,
  pendingOperations: [],
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function mergeItem(
  target: ConversationListState,
  item: ConversationListItem,
): void {
  const existing = target.byConversationId[item.conversationId];
  target.byConversationId[item.conversationId] = existing
    ? { ...existing, ...item }
    : item;
}

function removePending(target: ConversationListState, id: string): void {
  const idx = target.pendingOperations.indexOf(id);
  if (idx >= 0) target.pendingOperations.splice(idx, 1);
}

// ── Slice ────────────────────────────────────────────────────────────────────

const conversationListSlice = createSlice({
  name: "conversationList",
  initialState,
  reducers: {
    // ── Global sidebar list ──────────────────────────────────────────────────

    setGlobalListLoading(state) {
      state.globalStatus = "loading";
      state.globalError = null;
    },

    setGlobalListSuccess(
      state,
      action: PayloadAction<{
        items: ConversationListItem[];
        hasMore: boolean;
        replace?: boolean;
      }>,
    ) {
      const { items, hasMore, replace = true } = action.payload;
      for (const item of items) mergeItem(state, item);
      if (replace) {
        state.allConversationIds = items.map((i) => i.conversationId);
      } else {
        const existing = new Set(state.allConversationIds);
        for (const item of items) {
          if (!existing.has(item.conversationId)) {
            state.allConversationIds.push(item.conversationId);
            existing.add(item.conversationId);
          }
        }
      }
      state.globalHasMore = hasMore;
      state.globalStatus = "succeeded";
      state.globalLastFetchedAt = Date.now();
      state.globalError = null;
    },

    setGlobalListError(state, action: PayloadAction<string>) {
      state.globalStatus = "failed";
      state.globalError = action.payload;
    },

    // ── The trash (soft-deleted rows) ────────────────────────────────────────

    setTrashLoading(state) {
      state.trashStatus = "loading";
      state.trashError = null;
    },

    setTrashSuccess(
      state,
      action: PayloadAction<{ items: ConversationListItem[] }>,
    ) {
      const { items } = action.payload;
      // Trashed rows are held apart from `byConversationId`: that store feeds
      // every live list, and a deleted row must never be reachable from one.
      state.trashConversationIds = items.map((i) => i.conversationId);
      for (const item of items) {
        state.trashByConversationId[item.conversationId] = item;
      }
      state.trashStatus = "succeeded";
      state.trashError = null;
    },

    setTrashError(state, action: PayloadAction<string>) {
      state.trashStatus = "failed";
      state.trashError = action.payload;
    },

    /** A row left the trash (restored). */
    removeFromTrash(state, action: PayloadAction<string>) {
      const conversationId = action.payload;
      const idx = state.trashConversationIds.indexOf(conversationId);
      if (idx >= 0) state.trashConversationIds.splice(idx, 1);
      delete state.trashByConversationId[conversationId];
    },

    /** A row entered the trash (deleted) — keeps the trash honest without a refetch. */
    addToTrash(state, action: PayloadAction<ConversationListItem>) {
      const item = action.payload;
      state.trashByConversationId[item.conversationId] = item;
      if (!state.trashConversationIds.includes(item.conversationId)) {
        state.trashConversationIds.unshift(item.conversationId);
      }
    },

    // ── Entity management ────────────────────────────────────────────────────

    upsertConversation(state, action: PayloadAction<ConversationListItem>) {
      mergeItem(state, action.payload);
    },

    patchConversation(
      state,
      action: PayloadAction<{
        conversationId: string;
        patch: Partial<ConversationListItem>;
      }>,
    ) {
      const { conversationId, patch } = action.payload;
      const existing = state.byConversationId[conversationId];
      if (!existing) return;
      state.byConversationId[conversationId] = { ...existing, ...patch };
    },

    /** Prepend a newly-created conversation to the global list. */
    prependConversation(state, action: PayloadAction<ConversationListItem>) {
      const item = action.payload;
      mergeItem(state, item);
      const idx = state.allConversationIds.indexOf(item.conversationId);
      if (idx >= 0) state.allConversationIds.splice(idx, 1);
      state.allConversationIds.unshift(item.conversationId);
    },

    /** Optimistic rename — pair with `revertRename` on failure. */
    renameConversation(
      state,
      action: PayloadAction<{ conversationId: string; title: string }>,
    ) {
      const { conversationId, title } = action.payload;
      const item = state.byConversationId[conversationId];
      if (item) item.title = title;
    },

    revertRename(
      state,
      action: PayloadAction<{
        conversationId: string;
        previousTitle: string | null;
      }>,
    ) {
      const { conversationId, previousTitle } = action.payload;
      const item = state.byConversationId[conversationId];
      if (item) item.title = previousTitle;
      removePending(state, conversationId);
    },

    /** Optimistic remove — no matching revert yet (caller re-fetches on error). */
    removeConversation(state, action: PayloadAction<string>) {
      const conversationId = action.payload;
      delete state.byConversationId[conversationId];
      const idx = state.allConversationIds.indexOf(conversationId);
      if (idx >= 0) state.allConversationIds.splice(idx, 1);
      for (const entry of Object.values(state.agentCaches)) {
        const i = entry.conversationIds.indexOf(conversationId);
        if (i >= 0) entry.conversationIds.splice(i, 1);
      }
      removePending(state, conversationId);
    },

    /** Bump to top by updatedAt (global list only — agent caches are order-preserving). */
    touchConversation(
      state,
      action: PayloadAction<{ conversationId: string; updatedAt?: string }>,
    ) {
      const { conversationId, updatedAt } = action.payload;
      const item = state.byConversationId[conversationId];
      if (!item) return;
      item.updatedAt = updatedAt ?? new Date().toISOString();
      const idx = state.allConversationIds.indexOf(conversationId);
      if (idx > 0) {
        state.allConversationIds.splice(idx, 1);
        state.allConversationIds.unshift(conversationId);
      }
    },

    // ── Pending operations ───────────────────────────────────────────────────

    markPending(state, action: PayloadAction<string>) {
      if (!state.pendingOperations.includes(action.payload)) {
        state.pendingOperations.push(action.payload);
      }
    },

    clearPending(state, action: PayloadAction<string>) {
      removePending(state, action.payload);
    },

    // ── Agent-scoped caches ──────────────────────────────────────────────────

    setAgentCacheLoading(
      state,
      action: PayloadAction<{
        cacheKey: string;
        agentId: string;
        versionFilter: number | null;
      }>,
    ) {
      const { cacheKey, agentId, versionFilter } = action.payload;
      const existing = state.agentCaches[cacheKey];
      state.agentCaches[cacheKey] = {
        status: "loading",
        error: null,
        fetchedAt: existing?.fetchedAt ?? null,
        conversationIds: existing?.conversationIds ?? [],
        request: { agentId, versionFilter },
      };
    },

    setAgentCacheSuccess(
      state,
      action: PayloadAction<{
        cacheKey: string;
        agentId: string;
        versionFilter: number | null;
        items: ConversationListItem[];
      }>,
    ) {
      const { cacheKey, agentId, versionFilter, items } = action.payload;
      for (const item of items) mergeItem(state, item);
      state.agentCaches[cacheKey] = {
        status: "succeeded",
        error: null,
        fetchedAt: new Date().toISOString(),
        conversationIds: items.map((i) => i.conversationId),
        request: { agentId, versionFilter },
      };
    },

    setAgentCacheError(
      state,
      action: PayloadAction<{ cacheKey: string; error: string }>,
    ) {
      const existing = state.agentCaches[action.payload.cacheKey];
      if (!existing) return;
      existing.status = "failed";
      existing.error = action.payload.error;
    },

    /**
     * Upsert a single conversation row into multiple per-agent caches at once.
     * Used by the stream commit path — a new conversation appearing during
     * execution needs to land in the canonical agent's `::all` cache plus any
     * version-scoped caches that are open.
     *
     * This is the merged replacement for the legacy
     * `upsertAgentConversationInCaches` action.
     */
    upsertConversationInCaches(
      state,
      action: PayloadAction<{
        cacheKeys: string[];
        row: ConversationListItem;
        /** Each cacheKey's expected (agentId, versionFilter) so a missing
         * cache can be seeded with the correct request identity. */
        cacheIdentities?: Record<
          string,
          { agentId: string; versionFilter: number | null }
        >;
      }>,
    ) {
      const { cacheKeys, row, cacheIdentities } = action.payload;
      mergeItem(state, row);
      for (const key of cacheKeys) {
        const existing = state.agentCaches[key];
        if (existing) {
          if (!existing.conversationIds.includes(row.conversationId)) {
            existing.conversationIds.unshift(row.conversationId);
          }
          existing.status = "succeeded";
          existing.fetchedAt = new Date().toISOString();
        } else {
          const identity = cacheIdentities?.[key];
          if (!identity) continue;
          state.agentCaches[key] = {
            status: "succeeded",
            error: null,
            fetchedAt: new Date().toISOString(),
            conversationIds: [row.conversationId],
            request: identity,
          };
        }
      }
    },

    /**
     * Patch title/description on a conversation across the entity store. Since
     * per-agent caches reference into the shared `byConversationId` map, this
     * single patch is automatically visible from every view.
     *
     * Replaces the legacy `patchAgentConversationMetadata` action, which had
     * to walk every cache because each one owned its own copy of the row.
     */
    patchConversationMetadata(
      state,
      action: PayloadAction<{
        conversationId: string;
        title?: string | null;
        description?: string | null;
        keywords?: string[] | null;
      }>,
    ) {
      const { conversationId, title, description, keywords } = action.payload;
      const existing = state.byConversationId[conversationId];
      if (!existing) return;
      state.byConversationId[conversationId] = {
        ...existing,
        ...(title !== undefined ? { title } : {}),
        ...(description !== undefined ? { description } : {}),
        ...(keywords !== undefined ? { keywords } : {}),
        updatedAt: new Date().toISOString(),
      };
    },

    invalidateAgentCache(state, action: PayloadAction<string>) {
      delete state.agentCaches[action.payload];
    },

    clearAllAgentCaches(state) {
      state.agentCaches = {};
    },

    // ── Reset ─────────────────────────────────────────────────────────────────

    resetConversationList() {
      return initialState;
    },
  },
});

export const conversationListActions = conversationListSlice.actions;
export const {
  setGlobalListLoading,
  setGlobalListSuccess,
  setGlobalListError,
  setTrashLoading,
  setTrashSuccess,
  setTrashError,
  removeFromTrash,
  addToTrash,
  upsertConversation,
  patchConversation,
  prependConversation,
  renameConversation,
  revertRename,
  removeConversation,
  touchConversation,
  markPending,
  clearPending,
  setAgentCacheLoading,
  setAgentCacheSuccess,
  setAgentCacheError,
  upsertConversationInCaches,
  patchConversationMetadata,
  invalidateAgentCache,
  clearAllAgentCaches,
  resetConversationList,
} = conversationListSlice.actions;

/** @deprecated Legacy name. Prefer `upsertConversationInCaches`. */
export const upsertAgentConversationInCaches =
  conversationListSlice.actions.upsertConversationInCaches;

/** @deprecated Legacy name. Prefer `patchConversationMetadata`. */
export const patchAgentConversationMetadata =
  conversationListSlice.actions.patchConversationMetadata;

export const conversationListReducer = conversationListSlice.reducer;
export default conversationListSlice.reducer;

export type { ConversationListLoadStatus };
