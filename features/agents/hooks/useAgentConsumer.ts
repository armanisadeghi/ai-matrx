"use client";

/**
 * useAgentConsumer
 *
 * Wraps a single agentConsumers slot identified by `consumerId`.
 * Registers the slot on mount, and optionally unregisters on unmount.
 *
 * Returns all filter/sort/pagination values and stable dispatch wrappers so
 * components never need to import Redux actions directly.
 *
 * Usage:
 *   const consumer = useAgentConsumer("agents-main");
 *   consumer.setSearchTerm("gpt");
 *   consumer.toggleCategory("productivity");
 */

import { useEffect, useCallback } from "react";
import { useAppSelector, useAppDispatch } from "@/lib/redux/hooks";
import {
  registerAgentConsumer,
  unregisterAgentConsumer,
  setAgentConsumerFilter,
  setAgentConsumerPage,
  setAgentConsumerServerSearch,
  resetAgentConsumerFilters,
  selectAgentConsumer,
} from "@/features/agents/redux/agent-consumers/slice";
import { useServerAgentSearch } from "@/features/agents/hooks/useServerAgentSearch";
import type {
  AgentSortOption,
  AgentTab,
  AgentFavFilter,
  AgentArchFilter,
  AgentAccessFilter,
} from "@/features/agents/redux/agent-consumers/slice";

export interface UseAgentConsumerReturn {
  // ── Read ────────────────────────────────────────────────────────────────
  tab: AgentTab;
  sortBy: AgentSortOption;
  searchTerm: string;
  includedCats: string[];
  includedTags: string[];
  favFilter: AgentFavFilter;
  archFilter: AgentArchFilter;
  accessFilter: AgentAccessFilter;
  favoritesFirst: boolean;
  listPage: number;
  sharedPage: number;

  /** True if any filter differs from its default value. */
  hasActiveFilters: boolean;

  /** Tier 2 search — also match against agent prompt content. */
  deepSearch: boolean;

  /** True while a server-side search is in flight. */
  isServerSearching: boolean;

  // ── Write ───────────────────────────────────────────────────────────────
  setSearchTerm: (value: string) => void;

  /** Turn tier-2 (prompt content) search on or off. */
  setDeepSearch: (value: boolean) => void;
  setSortBy: (value: AgentSortOption) => void;
  setTab: (value: AgentTab) => void;
  setFavFilter: (value: AgentFavFilter) => void;
  setArchFilter: (value: AgentArchFilter) => void;
  setAccessFilter: (value: AgentAccessFilter) => void;

  /** Add category to inclusion set; if already present, remove (toggle). */
  toggleCategory: (cat: string) => void;
  /** Add tag to inclusion set; if already present, remove (toggle). */
  toggleTag: (tag: string) => void;

  toggleFavoritesFirst: () => void;

  /** Advance "owned" list page by 1. */
  loadMoreList: () => void;
  /** Advance "shared" list page by 1. */
  loadMoreShared: () => void;

  /** Reset ALL filters back to defaults. */
  resetFilters: () => void;
}

export function useAgentConsumer(
  consumerId: string,
  options?: {
    /**
     * If true, the consumer slot is deleted from Redux on component unmount.
     * Default: false — persistent consumers (like the main agents page) keep state.
     */
    unregisterOnUnmount?: boolean;
    /** Applied only when the consumer is first registered (idempotent). */
    initialTab?: AgentTab;
  },
): UseAgentConsumerReturn {
  const dispatch = useAppDispatch();
  const consumer = useAppSelector((state) =>
    selectAgentConsumer(state, consumerId),
  );

  useEffect(() => {
    dispatch(
      registerAgentConsumer(
        options?.initialTab
          ? { consumerId, initial: { tab: options.initialTab } }
          : consumerId,
      ),
    );
    return () => {
      if (options?.unregisterOnUnmount) {
        dispatch(unregisterAgentConsumer(consumerId));
      }
    };
    // consumerId is treated as stable; options is read once
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [consumerId, dispatch]);

  // ── Write helpers (stable references) ───────────────────────────────────

  const setSearchTerm = useCallback(
    (value: string) =>
      dispatch(
        setAgentConsumerFilter({ consumerId, patch: { searchTerm: value } }),
      ),
    [consumerId, dispatch],
  );

  const setDeepSearch = useCallback(
    (value: boolean) =>
      dispatch(
        setAgentConsumerFilter({ consumerId, patch: { deepSearch: value } }),
      ),
    [consumerId, dispatch],
  );

  const setSortBy = useCallback(
    (value: AgentSortOption) =>
      dispatch(
        setAgentConsumerFilter({ consumerId, patch: { sortBy: value } }),
      ),
    [consumerId, dispatch],
  );

  const setTab = useCallback(
    (value: AgentTab) =>
      dispatch(setAgentConsumerFilter({ consumerId, patch: { tab: value } })),
    [consumerId, dispatch],
  );

  const setFavFilter = useCallback(
    (value: AgentFavFilter) =>
      dispatch(
        setAgentConsumerFilter({ consumerId, patch: { favFilter: value } }),
      ),
    [consumerId, dispatch],
  );

  const setArchFilter = useCallback(
    (value: AgentArchFilter) =>
      dispatch(
        setAgentConsumerFilter({ consumerId, patch: { archFilter: value } }),
      ),
    [consumerId, dispatch],
  );

  const setAccessFilter = useCallback(
    (value: AgentAccessFilter) =>
      dispatch(
        setAgentConsumerFilter({ consumerId, patch: { accessFilter: value } }),
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
        setAgentConsumerFilter({ consumerId, patch: { includedCats: next } }),
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
        setAgentConsumerFilter({ consumerId, patch: { includedTags: next } }),
      );
    },
    [consumerId, consumer.includedTags, dispatch],
  );

  const toggleFavoritesFirst = useCallback(
    () =>
      dispatch(
        setAgentConsumerFilter({
          consumerId,
          patch: { favoritesFirst: !consumer.favoritesFirst },
        }),
      ),
    [consumerId, consumer.favoritesFirst, dispatch],
  );

  const loadMoreList = useCallback(
    () =>
      dispatch(
        setAgentConsumerPage({
          consumerId,
          which: "list",
          page: consumer.listPage + 1,
        }),
      ),
    [consumerId, consumer.listPage, dispatch],
  );

  const loadMoreShared = useCallback(
    () =>
      dispatch(
        setAgentConsumerPage({
          consumerId,
          which: "shared",
          page: consumer.sharedPage + 1,
        }),
      ),
    [consumerId, consumer.sharedPage, dispatch],
  );

  const resetFilters = useCallback(
    () => dispatch(resetAgentConsumerFilters(consumerId)),
    [consumerId, dispatch],
  );

  // ── Server-side search ───────────────────────────────────────────────────
  // Wired here, not in a page, so EVERY agent surface that uses a consumer
  // searches the full server-side set. A local-only search over a paginated
  // list reports "no results" for agents that were merely never fetched —
  // that is a wrong answer, not a missing feature.
  //
  // Results merge into the agent store additively (see searchAgentsServer) and
  // are recorded on the consumer so the filter admits matches the local
  // scorer cannot see, notably tier-2 prompt hits.
  const { matchedIds, isSearching } = useServerAgentSearch(
    consumer.searchTerm,
    consumer.deepSearch,
  );

  useEffect(() => {
    dispatch(
      setAgentConsumerServerSearch({
        consumerId,
        matchedIds: matchedIds ?? [],
        isSearching,
      }),
    );
  }, [consumerId, dispatch, matchedIds, isSearching]);

  // ── hasActiveFilters ─────────────────────────────────────────────────────
  const hasActiveFilters =
    consumer.searchTerm !== "" ||
    consumer.includedCats.length > 0 ||
    consumer.includedTags.length > 0 ||
    consumer.favFilter !== "all" ||
    consumer.archFilter !== "active" ||
    consumer.accessFilter !== "any" ||
    !consumer.favoritesFirst;

  return {
    // Read
    tab: consumer.tab,
    sortBy: consumer.sortBy,
    searchTerm: consumer.searchTerm,
    includedCats: consumer.includedCats,
    includedTags: consumer.includedTags,
    favFilter: consumer.favFilter,
    archFilter: consumer.archFilter,
    accessFilter: consumer.accessFilter,
    favoritesFirst: consumer.favoritesFirst,
    listPage: consumer.listPage,
    sharedPage: consumer.sharedPage,
    hasActiveFilters,
    deepSearch: consumer.deepSearch,
    isServerSearching: consumer.isServerSearching,
    // Write
    setSearchTerm,
    setDeepSearch,
    setSortBy,
    setTab,
    setFavFilter,
    setArchFilter,
    setAccessFilter,
    toggleCategory,
    toggleTag,
    toggleFavoritesFirst,
    loadMoreList,
    loadMoreShared,
    resetFilters,
  };
}
