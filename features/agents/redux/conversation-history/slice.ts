import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { ConversationListItem } from "@/features/agents/redux/conversation-list/conversation-list.types";
import {
  defaultScopeState,
  type ConversationHistoryScopeState,
  type ConversationHistoryState,
  type HistoryGrouping,
  type HistoryStatus,
} from "./types";

const initialState: ConversationHistoryState = {
  scopes: {},
};

/** Ensures `state.scopes[scopeId]` exists and returns it for mutation. */
function ensureScope(
  state: ConversationHistoryState,
  scopeId: string,
): ConversationHistoryScopeState {
  let scope = state.scopes[scopeId];
  if (!scope) {
    scope = { ...defaultScopeState };
    state.scopes[scopeId] = scope;
  }
  return scope;
}

/** Sorts items by `updatedAt` desc with a stable fallback. */
function sortByUpdated(items: ConversationListItem[]): ConversationListItem[] {
  return items
    .slice()
    .sort(
      (a, b) =>
        +new Date(b.updatedAt ?? 0) - +new Date(a.updatedAt ?? 0) ||
        a.conversationId.localeCompare(b.conversationId),
    );
}

const slice = createSlice({
  name: "conversationHistory",
  initialState,
  reducers: {
    /**
     * Registers a scope and/or applies initial config. Safe to call on every
     * mount — existing items/offset are preserved unless `reset` is set.
     */
    configureScope(
      state,
      action: PayloadAction<{
        scopeId: string;
        agentIds?: string[];
        /** `source_feature` values to hide from this scope. Empty = no filter. */
        excludeSourceFeatures?: string[];
        grouping?: HistoryGrouping;
        pageSize?: number;
        /** When true, drops items/offset so a fresh fetch repopulates. */
        reset?: boolean;
      }>,
    ) {
      const {
        scopeId,
        agentIds,
        excludeSourceFeatures,
        grouping,
        pageSize,
        reset,
      } = action.payload;
      const scope = ensureScope(state, scopeId);
      if (agentIds !== undefined) scope.agentIds = agentIds;
      if (excludeSourceFeatures !== undefined) {
        scope.excludeSourceFeatures = excludeSourceFeatures;
      }
      if (grouping !== undefined) scope.grouping = grouping;
      if (pageSize !== undefined) scope.pageSize = pageSize;
      if (reset) {
        scope.items = [];
        scope.offset = 0;
        scope.hasMore = false;
        scope.status = "idle";
        scope.error = null;
        scope.lastFetchedAt = null;
      }
    },
    setScopeAgentIds(
      state,
      action: PayloadAction<{ scopeId: string; agentIds: string[] }>,
    ) {
      const scope = ensureScope(state, action.payload.scopeId);
      const sameLen = scope.agentIds.length === action.payload.agentIds.length;
      const same =
        sameLen &&
        scope.agentIds.every((id, i) => id === action.payload.agentIds[i]);
      if (same) return;
      scope.agentIds = action.payload.agentIds;
      // Changing the agent set invalidates the current page window.
      scope.items = [];
      scope.offset = 0;
      scope.hasMore = false;
      scope.status = "idle";
      scope.error = null;
      scope.lastFetchedAt = null;
    },
    setScopeSearch(
      state,
      action: PayloadAction<{ scopeId: string; searchTerm: string }>,
    ) {
      ensureScope(state, action.payload.scopeId).searchTerm =
        action.payload.searchTerm;
    },
    setScopeGrouping(
      state,
      action: PayloadAction<{ scopeId: string; grouping: HistoryGrouping }>,
    ) {
      ensureScope(state, action.payload.scopeId).grouping =
        action.payload.grouping;
    },
    setScopeStatus(
      state,
      action: PayloadAction<{
        scopeId: string;
        status: HistoryStatus;
        error?: string | null;
      }>,
    ) {
      const scope = ensureScope(state, action.payload.scopeId);
      scope.status = action.payload.status;
      if (action.payload.error !== undefined) {
        scope.error = action.payload.error;
      }
    },
    /** Replaces or appends items after a successful fetch. */
    setScopePageSuccess(
      state,
      action: PayloadAction<{
        scopeId: string;
        items: ConversationListItem[];
        hasMore: boolean;
        /** When true, replaces instead of appends (used for first page / reload). */
        replace: boolean;
        /** New `offset` to use for the next page fetch. */
        nextOffset: number;
      }>,
    ) {
      const scope = ensureScope(state, action.payload.scopeId);
      if (action.payload.replace) {
        scope.items = sortByUpdated(action.payload.items);
      } else {
        // Dedup by conversationId while preserving order (existing first).
        const seen = new Set(scope.items.map((i) => i.conversationId));
        const merged = scope.items.slice();
        for (const item of action.payload.items) {
          if (!seen.has(item.conversationId)) {
            merged.push(item);
            seen.add(item.conversationId);
          }
        }
        scope.items = sortByUpdated(merged);
      }
      scope.hasMore = action.payload.hasMore;
      scope.offset = action.payload.nextOffset;
      scope.status = "succeeded";
      scope.error = null;
      scope.lastFetchedAt = Date.now();
    },
    /**
     * Patches a single conversation (title, messageCount, updatedAt, etc.)
     * inside every scope that currently lists it. Call this after a rename
     * or new message so sidebars don't go stale.
     */
    patchConversationInScopes(
      state,
      action: PayloadAction<{
        conversationId: string;
        patch: Partial<ConversationListItem>;
      }>,
    ) {
      const { conversationId, patch } = action.payload;
      for (const scope of Object.values(state.scopes)) {
        const idx = scope.items.findIndex(
          (i) => i.conversationId === conversationId,
        );
        if (idx === -1) continue;
        scope.items[idx] = { ...scope.items[idx], ...patch };
      }
    },
    removeConversationFromScopes(
      state,
      action: PayloadAction<{ conversationId: string }>,
    ) {
      const { conversationId } = action.payload;
      for (const scope of Object.values(state.scopes)) {
        scope.items = scope.items.filter(
          (i) => i.conversationId !== conversationId,
        );
      }
    },
    clearScope(state, action: PayloadAction<{ scopeId: string }>) {
      delete state.scopes[action.payload.scopeId];
    },
  },
});

export const {
  configureScope,
  setScopeAgentIds,
  setScopeSearch,
  setScopeGrouping,
  setScopeStatus,
  setScopePageSuccess,
  patchConversationInScopes,
  removeConversationFromScopes,
  clearScope,
} = slice.actions;

export const conversationHistoryReducer = slice.reducer;
export default slice.reducer;
