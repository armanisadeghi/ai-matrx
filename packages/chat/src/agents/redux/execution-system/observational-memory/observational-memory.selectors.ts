/**
 * Observational Memory Selectors
 *
 * SELECTOR RULES enforced here:
 *  - Primitives returned directly (stable by value).
 *  - No ?? [] / ?? {} defaults — return undefined / null, guard in caller.
 *  - Object accessors return the raw state reference (no new objects).
 */

import { createSelector } from "@reduxjs/toolkit";
import type { ChatRootState } from "../../../../store/root-state";
import type {
  MemoryEventEntry,
  ObservationalMemoryConversationState,
  ObservationalMemoryMetadata,
  MemoryCostSummary,
  MemoryCostFetchState,
  MemoryRunningCounters,
} from "./observational-memory.slice";

// ── Raw accessors ────────────────────────────────────────────────────────────

export const selectObservationalMemoryState =
  (conversationId: string | null | undefined) =>
  (state: ChatRootState): ObservationalMemoryConversationState | undefined => {
    if (!conversationId) return undefined;
    return state.observationalMemory.byConversationId[conversationId];
  };

export const selectAllObservationalMemoryConversations = (
  state: ChatRootState,
): Record<string, ObservationalMemoryConversationState> =>
  state.observationalMemory.byConversationId;

// ── Persisted metadata ───────────────────────────────────────────────────────

export const selectMemoryMetadata =
  (conversationId: string | null | undefined) =>
  (state: ChatRootState): ObservationalMemoryMetadata | null => {
    if (!conversationId) return null;
    return (
      state.observationalMemory.byConversationId[conversationId]?.metadata ??
      null
    );
  };

export const selectIsMemoryEnabledForConversation =
  (conversationId: string | null | undefined) =>
  (state: ChatRootState): boolean => {
    if (!conversationId) return false;
    return (
      state.observationalMemory.byConversationId[conversationId]?.isEnabled ??
      false
    );
  };

export const selectMemoryModelForConversation =
  (conversationId: string | null | undefined) =>
  (state: ChatRootState): string | null => {
    if (!conversationId) return null;
    return (
      state.observationalMemory.byConversationId[conversationId]?.metadata
        ?.model ?? null
    );
  };

export const selectMemoryScopeForConversation =
  (conversationId: string | null | undefined) =>
  (state: ChatRootState): string | null => {
    if (!conversationId) return null;
    return (
      state.observationalMemory.byConversationId[conversationId]?.metadata
        ?.scope ?? null
    );
  };

// ── Degraded / error state ───────────────────────────────────────────────────

export const selectMemoryDegraded =
  (conversationId: string | null | undefined) =>
  (state: ChatRootState): boolean => {
    if (!conversationId) return false;
    return (
      state.observationalMemory.byConversationId[conversationId]?.degraded ??
      false
    );
  };

export const selectMemoryLastError =
  (conversationId: string | null | undefined) =>
  (state: ChatRootState): ObservationalMemoryConversationState["lastError"] => {
    if (!conversationId) return null;
    return (
      state.observationalMemory.byConversationId[conversationId]?.lastError ??
      null
    );
  };

// ── Events + counters ────────────────────────────────────────────────────────

const EMPTY_EVENTS: readonly MemoryEventEntry[] = Object.freeze([]);

export const selectMemoryEvents =
  (conversationId: string | null | undefined) =>
  (state: ChatRootState): readonly MemoryEventEntry[] => {
    if (!conversationId) return EMPTY_EVENTS;
    return (
      state.observationalMemory.byConversationId[conversationId]?.events ??
      EMPTY_EVENTS
    );
  };

export const selectMemoryCounters =
  (conversationId: string | null | undefined) =>
  (state: ChatRootState): MemoryRunningCounters | null => {
    if (!conversationId) return null;
    return (
      state.observationalMemory.byConversationId[conversationId]?.counters ??
      null
    );
  };

/**
 * Memoised recent events selector (newest first). Safe to use in a component
 * that maps over it; reselect will return the same array reference until the
 * underlying events array changes.
 */
export const selectRecentMemoryEvents = (
  conversationId: string | null | undefined,
  limit: number = 50,
) =>
  createSelector(
    [
      (state: ChatRootState) =>
        conversationId
          ? (state.observationalMemory.byConversationId[conversationId]
              ?.events ?? EMPTY_EVENTS)
          : EMPTY_EVENTS,
    ],
    (events): MemoryEventEntry[] => {
      if (events.length === 0) return [];
      const slice = events.slice(Math.max(0, events.length - limit));
      slice.reverse();
      return slice;
    },
  );

// ── Cost summary + fetch state ───────────────────────────────────────────────

export const selectMemoryCostSummary =
  (conversationId: string | null | undefined) =>
  (state: ChatRootState): MemoryCostSummary | null => {
    if (!conversationId) return null;
    return (
      state.observationalMemory.byConversationId[conversationId]?.costSummary ??
      null
    );
  };

export const selectMemoryCostFetchState =
  (conversationId: string | null | undefined) =>
  (state: ChatRootState): MemoryCostFetchState | null => {
    if (!conversationId) return null;
    return (
      state.observationalMemory.byConversationId[conversationId]?.costFetch ??
      null
    );
  };
