"use client";

/**
 * useAgentAppConsumer
 *
 * Wraps a single agentAppConsumers slot identified by `consumerId`.
 * Registers the slot on mount, optionally unregisters on unmount.
 *
 * Returns all filter/sort/pagination values plus stable dispatch wrappers,
 * so list UI components never need to import Redux actions directly.
 *
 * Usage:
 *   const consumer = useAgentAppConsumer("apps-main");
 *   consumer.setSearchTerm("tutor");
 *   consumer.toggleAgent(agentId);
 *
 * Mirrors `features/agents/hooks/useAgentConsumer.ts`. To add a new
 * filter/sort dimension, add the field to AgentAppConsumerState in
 * slice.ts, expose a setter here, and the consumer's components pick it
 * up automatically.
 */

import { useEffect, useCallback } from "react";
import { useAppSelector, useAppDispatch } from "@/lib/redux/hooks";
import {
  registerAgentAppConsumer,
  unregisterAgentAppConsumer,
  setAgentAppConsumerFilter,
  setAgentAppConsumerPage,
  resetAgentAppConsumerFilters,
  selectAgentAppConsumer,
  DEFAULT_AGENT_APP_CONSUMER_STATE,
} from "@/features/agent-apps/redux/agent-app-consumers/slice";
import type {
  AgentAppSortOption,
  AgentAppTab,
  AgentAppArchFilter,
  AgentAppVisibilityFilter,
} from "@/features/agent-apps/redux/agent-app-consumers/slice";

export interface UseAgentAppConsumerReturn {
  // ── Read ────────────────────────────────────────────────────────────────
  tab: AgentAppTab;
  sortBy: AgentAppSortOption;
  searchTerm: string;
  includedCats: string[];
  includedTags: string[];
  includedAgents: string[];
  archFilter: AgentAppArchFilter;
  visibilityFilter: AgentAppVisibilityFilter;
  listPage: number;

  /** True if any filter differs from its default value. */
  hasActiveFilters: boolean;

  // ── Write ───────────────────────────────────────────────────────────────
  setSearchTerm: (value: string) => void;
  setSortBy: (value: AgentAppSortOption) => void;
  setTab: (value: AgentAppTab) => void;
  setArchFilter: (value: AgentAppArchFilter) => void;
  setVisibilityFilter: (value: AgentAppVisibilityFilter) => void;

  /** Add category to inclusion set; if already present, remove (toggle). */
  toggleCategory: (cat: string) => void;
  /** Add tag to inclusion set; if already present, remove (toggle). */
  toggleTag: (tag: string) => void;
  /** Add agent_id to inclusion set; if already present, remove (toggle). */
  toggleAgent: (agentId: string) => void;

  /** Advance the list page by 1. */
  loadMoreList: () => void;

  /** Reset ALL filters back to defaults. */
  resetFilters: () => void;
}

export function useAgentAppConsumer(
  consumerId: string,
  options?: {
    /** Delete consumer state from Redux on unmount. */
    unregisterOnUnmount?: boolean;
  },
): UseAgentAppConsumerReturn {
  const dispatch = useAppDispatch();
  const consumer = useAppSelector((state) =>
    selectAgentAppConsumer(state, consumerId),
  );

  useEffect(() => {
    dispatch(registerAgentAppConsumer(consumerId));
    return () => {
      if (options?.unregisterOnUnmount) {
        dispatch(unregisterAgentAppConsumer(consumerId));
      }
    };
    // consumerId is stable; options is read once
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [consumerId, dispatch]);

  // ── Write helpers (stable references) ───────────────────────────────────

  const setSearchTerm = useCallback(
    (value: string) =>
      dispatch(
        setAgentAppConsumerFilter({
          consumerId,
          patch: { searchTerm: value },
        }),
      ),
    [consumerId, dispatch],
  );

  const setSortBy = useCallback(
    (value: AgentAppSortOption) =>
      dispatch(
        setAgentAppConsumerFilter({ consumerId, patch: { sortBy: value } }),
      ),
    [consumerId, dispatch],
  );

  const setTab = useCallback(
    (value: AgentAppTab) =>
      dispatch(
        setAgentAppConsumerFilter({ consumerId, patch: { tab: value } }),
      ),
    [consumerId, dispatch],
  );

  const setArchFilter = useCallback(
    (value: AgentAppArchFilter) =>
      dispatch(
        setAgentAppConsumerFilter({
          consumerId,
          patch: { archFilter: value },
        }),
      ),
    [consumerId, dispatch],
  );

  const setVisibilityFilter = useCallback(
    (value: AgentAppVisibilityFilter) =>
      dispatch(
        setAgentAppConsumerFilter({
          consumerId,
          patch: { visibilityFilter: value },
        }),
      ),
    [consumerId, dispatch],
  );

  const toggleCategory = useCallback(
    (cat: string) => {
      const current = consumer.includedCats;
      const next = current.includes(cat)
        ? current.filter((c) => c !== cat)
        : [...current, cat];
      dispatch(
        setAgentAppConsumerFilter({
          consumerId,
          patch: { includedCats: next },
        }),
      );
    },
    [consumerId, consumer.includedCats, dispatch],
  );

  const toggleTag = useCallback(
    (tag: string) => {
      const current = consumer.includedTags;
      const next = current.includes(tag)
        ? current.filter((t) => t !== tag)
        : [...current, tag];
      dispatch(
        setAgentAppConsumerFilter({
          consumerId,
          patch: { includedTags: next },
        }),
      );
    },
    [consumerId, consumer.includedTags, dispatch],
  );

  const toggleAgent = useCallback(
    (agentId: string) => {
      const current = consumer.includedAgents;
      const next = current.includes(agentId)
        ? current.filter((a) => a !== agentId)
        : [...current, agentId];
      dispatch(
        setAgentAppConsumerFilter({
          consumerId,
          patch: { includedAgents: next },
        }),
      );
    },
    [consumerId, consumer.includedAgents, dispatch],
  );

  const loadMoreList = useCallback(
    () =>
      dispatch(
        setAgentAppConsumerPage({
          consumerId,
          page: consumer.listPage + 1,
        }),
      ),
    [consumerId, consumer.listPage, dispatch],
  );

  const resetFilters = useCallback(
    () => dispatch(resetAgentAppConsumerFilters(consumerId)),
    [consumerId, dispatch],
  );

  // ── hasActiveFilters ─────────────────────────────────────────────────────
  // Mirrors the DEFAULT_AGENT_APP_CONSUMER_STATE comparisons; if any field
  // diverges from its default the user has an active filter.
  const d = DEFAULT_AGENT_APP_CONSUMER_STATE;
  const hasActiveFilters =
    consumer.searchTerm !== d.searchTerm ||
    consumer.tab !== d.tab ||
    consumer.sortBy !== d.sortBy ||
    consumer.includedCats.length > 0 ||
    consumer.includedTags.length > 0 ||
    consumer.includedAgents.length > 0 ||
    consumer.archFilter !== d.archFilter ||
    consumer.visibilityFilter !== d.visibilityFilter;

  return {
    // Read
    tab: consumer.tab,
    sortBy: consumer.sortBy,
    searchTerm: consumer.searchTerm,
    includedCats: consumer.includedCats,
    includedTags: consumer.includedTags,
    includedAgents: consumer.includedAgents,
    archFilter: consumer.archFilter,
    visibilityFilter: consumer.visibilityFilter,
    listPage: consumer.listPage,
    hasActiveFilters,
    // Write
    setSearchTerm,
    setSortBy,
    setTab,
    setArchFilter,
    setVisibilityFilter,
    toggleCategory,
    toggleTag,
    toggleAgent,
    loadMoreList,
    resetFilters,
  };
}
