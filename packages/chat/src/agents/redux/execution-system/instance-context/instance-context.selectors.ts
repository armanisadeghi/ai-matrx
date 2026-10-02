import { createSelector } from "@reduxjs/toolkit";
import type { RootState } from "@host/lib/redux/store";
import type { InstanceContextEntry } from "../../../types/instance.types";

const EMPTY_CONTEXT_ENTRIES: InstanceContextEntry[] = [];

export const selectInstanceContextEntries = (conversationId: string) =>
  createSelector(
    (state: RootState) =>
      state.instanceContext.byConversationId[conversationId],
    (context): InstanceContextEntry[] => {
      if (!context) return EMPTY_CONTEXT_ENTRIES;
      const values = Object.values(context);
      return values.length === 0 ? EMPTY_CONTEXT_ENTRIES : values;
    },
  );

export const selectInstanceContextEntry =
  (conversationId: string, key: string) =>
  (state: RootState): InstanceContextEntry | undefined =>
    state.instanceContext.byConversationId[conversationId]?.[key];

/**
 * Context entries that match agent-defined slots.
 */
export const selectSlotMatchedContext = (conversationId: string) =>
  createSelector(
    (state: RootState) =>
      state.instanceContext.byConversationId[conversationId],
    (context): InstanceContextEntry[] => {
      if (!context) return EMPTY_CONTEXT_ENTRIES;
      const filtered = Object.values(context).filter((e) => e.slotMatched);
      return filtered.length === 0 ? EMPTY_CONTEXT_ENTRIES : filtered;
    },
  );

/**
 * Ad-hoc context entries (not matching any slot).
 */
export const selectAdHocContext = (conversationId: string) =>
  createSelector(
    (state: RootState) =>
      state.instanceContext.byConversationId[conversationId],
    (context): InstanceContextEntry[] => {
      if (!context) return EMPTY_CONTEXT_ENTRIES;
      const filtered = Object.values(context).filter((e) => !e.slotMatched);
      return filtered.length === 0 ? EMPTY_CONTEXT_ENTRIES : filtered;
    },
  );

const EMPTY_SURFACE_KEYS: readonly string[] = [];

/**
 * The context keys the PAGE'S SURFACE contributed (the last live surface
 * mapping pass — `replaceSurfaceContextEntries`). The composer groups these
 * into one page-context chip; every other entry keeps its own chip.
 */
export const selectSurfaceContextKeys =
  (conversationId: string) =>
  (state: RootState): readonly string[] =>
    state.instanceContext.surfaceKeysByConversationId[conversationId] ?? EMPTY_SURFACE_KEYS;
