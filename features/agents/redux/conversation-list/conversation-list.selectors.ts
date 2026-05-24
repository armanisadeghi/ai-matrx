"use client";

import { createSelector } from "@reduxjs/toolkit";
import type { RootState } from "@/lib/redux/store";
import type {
  ConversationListItem,
  ConversationListAgentCacheEntry,
  ConversationListLoadStatus,
} from "./conversation-list.types";
import {
  CONVERSATION_LIST_TTL_MS,
  conversationListCacheKey,
} from "./conversation-list.types";
import { selectAgentIdFromInstance } from "@/features/agents/redux/execution-system/conversations/conversations.selectors";

const EMPTY_ITEMS: ConversationListItem[] = [];
const EMPTY_IDS: string[] = [];

// ── Slice root ───────────────────────────────────────────────────────────────

const selectSlice = (state: RootState) => state.conversationList;

// ── Global sidebar list ──────────────────────────────────────────────────────

export const selectGlobalConversationList = createSelector(
  [selectSlice],
  (slice): ConversationListItem[] => {
    if (slice.allConversationIds.length === 0) return EMPTY_ITEMS;
    const out: ConversationListItem[] = [];
    for (const id of slice.allConversationIds) {
      const item = slice.byConversationId[id];
      if (item) out.push(item);
    }
    return out.length === 0 ? EMPTY_ITEMS : out;
  },
);

export const selectGlobalConversationIds = (state: RootState): string[] =>
  state.conversationList.allConversationIds;

export const selectGlobalListStatus = (
  state: RootState,
): ConversationListLoadStatus => state.conversationList.globalStatus;

export const selectGlobalListError = (state: RootState): string | null =>
  state.conversationList.globalError;

export const selectGlobalListHasMore = (state: RootState): boolean =>
  state.conversationList.globalHasMore;

export const selectGlobalListLastFetchedAt = (
  state: RootState,
): number | null => state.conversationList.globalLastFetchedAt;

/** True when the global list is fresh (no refetch needed). */
export const selectGlobalListIsFresh =
  (ttlMs = CONVERSATION_LIST_TTL_MS) =>
  (state: RootState): boolean => {
    const { globalLastFetchedAt, globalStatus } = state.conversationList;
    if (globalStatus === "loading") return true;
    if (!globalLastFetchedAt) return false;
    return Date.now() - globalLastFetchedAt < ttlMs;
  };

// ── Per-conversation ─────────────────────────────────────────────────────────

export const selectConversationListItemById =
  (conversationId: string) =>
  (state: RootState): ConversationListItem | null =>
    state.conversationList.byConversationId[conversationId] ?? null;

export const selectConversationIsPending =
  (conversationId: string) =>
  (state: RootState): boolean =>
    state.conversationList.pendingOperations.includes(conversationId);

// ── Agent-scoped caches ──────────────────────────────────────────────────────

export const selectAgentConversationsCache =
  (agentId: string, versionFilter: number | null) =>
  (state: RootState): ConversationListAgentCacheEntry | undefined =>
    state.conversationList.agentCaches[
      conversationListCacheKey(agentId, versionFilter)
    ];

/**
 * Selector factory — returns all conversations for an agent (optionally
 * filtered by version) as full items. Memoized per (agentId, versionFilter).
 */
export function makeSelectAgentConversationList(
  agentId: string,
  versionFilter: number | null,
) {
  const key = conversationListCacheKey(agentId, versionFilter);
  return createSelector(
    [(state: RootState) => state.conversationList],
    (
      slice,
    ): {
      conversations: ConversationListItem[];
      status: ConversationListLoadStatus;
      error: string | null;
      fetchedAt: string | null;
    } => {
      const entry = slice.agentCaches[key];
      if (!entry) {
        return {
          conversations: EMPTY_ITEMS,
          status: "idle",
          error: null,
          fetchedAt: null,
        };
      }
      const items: ConversationListItem[] = [];
      for (const id of entry.conversationIds) {
        const item = slice.byConversationId[id];
        if (item) items.push(item);
      }
      return {
        conversations: items.length === 0 ? EMPTY_ITEMS : items,
        status: entry.status,
        error: entry.error,
        fetchedAt: entry.fetchedAt,
      };
    },
  );
}

export const selectAgentConversationIds =
  (agentId: string, versionFilter: number | null) =>
  (state: RootState): string[] =>
    state.conversationList.agentCaches[
      conversationListCacheKey(agentId, versionFilter)
    ]?.conversationIds ?? EMPTY_IDS;

/**
 * Drop-in replacement for the legacy `makeSelectAgentConversations` selector
 * from `features/agents/redux/agent-conversations/...`. Kept under the old
 * name so consumer sites migrate via import-path rewrite only.
 */
export const makeSelectAgentConversations = makeSelectAgentConversationList;

/**
 * Drop-in replacement for the legacy `selectAgentConversationsEntry` selector.
 * Returns the full cache entry or undefined. Accepts canonical agx_agent.id.
 */
export function selectAgentConversationsEntry(
  state: RootState,
  agentId: string,
  versionFilter: number | null,
) {
  return state.conversationList.agentCaches[
    conversationListCacheKey(agentId, versionFilter)
  ];
}

/**
 * Drop-in replacement for `selectAgentConversationsEntryForInstance`. Resolves
 * instance → agent map key → canonical agent id, then reads the cache.
 */
export function selectAgentConversationsEntryForInstance(
  state: RootState,
  instanceId: string,
  versionFilter: number | null,
) {
  const mapKey = selectAgentIdFromInstance(instanceId)(state);
  if (!mapKey) return undefined;
  const agent = state.agentDefinition.agents?.[mapKey];
  const canonicalAgentId = agent?.parentAgentId ?? agent?.id ?? mapKey;
  return selectAgentConversationsEntry(state, canonicalAgentId, versionFilter);
}
