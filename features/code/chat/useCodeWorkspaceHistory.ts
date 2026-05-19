"use client";

/**
 * Hook that maps the /code workspace's user preferences onto the props of
 * the reusable `ConversationHistorySidebar`. Kept local to the code
 * feature so future surfaces (app builder chat, task canvas, …) can write
 * their own equivalent without fighting a one-size-fits-all helper.
 */

import { useCallback, useMemo } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  setPreference,
  type CodeAgentFilter,
  type ConversationHistoryGrouping,
} from "@/lib/redux/preferences/userPreferencesSlice";
import { selectCodingPreferences } from "@/lib/redux/preferences/userPreferenceSelectors";
import { makeSelectAgentIdsForFilter } from "@/features/agents/redux/agent-filter/selectors";
import type { ConversationListItem } from "@/features/agents/redux/conversation-list/conversation-list.types";

export interface UseCodeWorkspaceHistoryResult {
  /** The saved filter (source of truth in preferences). */
  filter: CodeAgentFilter;
  /** Agent ids resolved from the current filter. */
  filteredAgentIds: string[];
  /** Saved default grouping. */
  defaultGrouping: ConversationHistoryGrouping;
  /** Saved page size. */
  pageSize: number;
  /** Client-side favorites (from preferences). */
  favoriteConversationIds: string[];
  /** Handler to pass to `ConversationHistorySidebar#isFavorite`. */
  isFavorite: (conversationId: string) => boolean;
  /** Handler to pass to `ConversationHistorySidebar#onToggleFavorite`. */
  onToggleFavorite: (conv: ConversationListItem) => void;
}

/**
 * Reads the `coding` preferences module and exposes derived values ready
 * to drop into `ConversationHistorySidebar`. Pure-read + small wrappers —
 * no effects or data fetching here.
 */
export function useCodeWorkspaceHistory(): UseCodeWorkspaceHistoryResult {
  const dispatch = useAppDispatch();
  const coding = useAppSelector(selectCodingPreferences);
  const filter = coding.agentFilter;

  const selectIds = useMemo(() => makeSelectAgentIdsForFilter(), []);
  const filteredAgentIds = useAppSelector((state) => selectIds(state, filter));

  const favoriteConversationIds = coding.favoriteConversationIds;

  const isFavorite = useCallback(
    (conversationId: string) =>
      favoriteConversationIds.includes(conversationId),
    [favoriteConversationIds],
  );

  const onToggleFavorite = useCallback(
    (conv: ConversationListItem) => {
      const already = favoriteConversationIds.includes(conv.conversationId);
      const next = already
        ? favoriteConversationIds.filter((id) => id !== conv.conversationId)
        : [...favoriteConversationIds, conv.conversationId];
      dispatch(
        setPreference({
          module: "coding",
          preference: "favoriteConversationIds",
          value: next,
        }),
      );
    },
    [dispatch, favoriteConversationIds],
  );

  return {
    filter,
    filteredAgentIds,
    defaultGrouping: coding.historyGrouping,
    pageSize: coding.historyPageSize,
    favoriteConversationIds,
    isFavorite,
    onToggleFavorite,
  };
}
