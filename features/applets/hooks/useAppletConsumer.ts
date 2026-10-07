"use client";

/**
 * useAppletConsumer
 *
 * Wraps a single appletConsumers slot identified by `consumerId`.
 * Registers the slot on mount, optionally unregisters on unmount.
 *
 * Returns all filter/sort/pagination values plus stable dispatch wrappers,
 * so list UI components never need to import Redux actions directly.
 *
 * Usage:
 *   const consumer = useAppletConsumer("apps-main");
 *   consumer.setSearchTerm("tutor");
 *
 * Mirrors `features/agents/hooks/useAgentConsumer.ts`. To add a new
 * filter/sort dimension, add the field to AppletConsumerState in
 * slice.ts, expose a setter here, and the consumer's components pick it
 * up automatically.
 */

import { useEffect, useCallback } from "react";
import { useAppSelector, useAppDispatch } from "@/lib/redux/hooks";
import {
  registerAppletConsumer,
  unregisterAppletConsumer,
  setAppletConsumerFilter,
  setAppletConsumerPage,
  resetAppletConsumerFilters,
  selectAppletConsumer,
  DEFAULT_APPLET_CONSUMER_STATE,
} from "@/features/applets/redux/applet-consumers/slice";
import type {
  AppletSortOption,
  AppletTab,
  AppletArchFilter,
  AppletVisibilityFilter,
} from "@/features/applets/redux/applet-consumers/slice";

export interface UseAppletConsumerReturn {
  // ── Read ────────────────────────────────────────────────────────────────
  tab: AppletTab;
  sortBy: AppletSortOption;
  searchTerm: string;
  includedCats: string[];
  includedTags: string[];
  archFilter: AppletArchFilter;
  visibilityFilter: AppletVisibilityFilter;
  listPage: number;

  /** True if any filter differs from its default value. */
  hasActiveFilters: boolean;

  // ── Write ───────────────────────────────────────────────────────────────
  setSearchTerm: (value: string) => void;
  setSortBy: (value: AppletSortOption) => void;
  setTab: (value: AppletTab) => void;
  setArchFilter: (value: AppletArchFilter) => void;
  setVisibilityFilter: (value: AppletVisibilityFilter) => void;

  /** Add category to inclusion set; if already present, remove (toggle). */
  toggleCategory: (cat: string) => void;
  /** Add tag to inclusion set; if already present, remove (toggle). */
  toggleTag: (tag: string) => void;

  /** Advance the list page by 1. */
  loadMoreList: () => void;

  /** Reset ALL filters back to defaults. */
  resetFilters: () => void;
}

export function useAppletConsumer(
  consumerId: string,
  options?: {
    /** Delete consumer state from Redux on unmount. */
    unregisterOnUnmount?: boolean;
  },
): UseAppletConsumerReturn {
  const dispatch = useAppDispatch();
  const consumer = useAppSelector((state) =>
    selectAppletConsumer(state, consumerId),
  );

  useEffect(() => {
    dispatch(registerAppletConsumer(consumerId));
    return () => {
      if (options?.unregisterOnUnmount) {
        dispatch(unregisterAppletConsumer(consumerId));
      }
    };
    // consumerId is stable; options is read once
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [consumerId, dispatch]);

  // ── Write helpers (stable references) ───────────────────────────────────

  const setSearchTerm = useCallback(
    (value: string) =>
      dispatch(
        setAppletConsumerFilter({
          consumerId,
          patch: { searchTerm: value },
        }),
      ),
    [consumerId, dispatch],
  );

  const setSortBy = useCallback(
    (value: AppletSortOption) =>
      dispatch(
        setAppletConsumerFilter({ consumerId, patch: { sortBy: value } }),
      ),
    [consumerId, dispatch],
  );

  const setTab = useCallback(
    (value: AppletTab) =>
      dispatch(
        setAppletConsumerFilter({ consumerId, patch: { tab: value } }),
      ),
    [consumerId, dispatch],
  );

  const setArchFilter = useCallback(
    (value: AppletArchFilter) =>
      dispatch(
        setAppletConsumerFilter({
          consumerId,
          patch: { archFilter: value },
        }),
      ),
    [consumerId, dispatch],
  );

  const setVisibilityFilter = useCallback(
    (value: AppletVisibilityFilter) =>
      dispatch(
        setAppletConsumerFilter({
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
        setAppletConsumerFilter({
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
        setAppletConsumerFilter({
          consumerId,
          patch: { includedTags: next },
        }),
      );
    },
    [consumerId, consumer.includedTags, dispatch],
  );


  const loadMoreList = useCallback(
    () =>
      dispatch(
        setAppletConsumerPage({
          consumerId,
          page: consumer.listPage + 1,
        }),
      ),
    [consumerId, consumer.listPage, dispatch],
  );

  const resetFilters = useCallback(
    () => dispatch(resetAppletConsumerFilters(consumerId)),
    [consumerId, dispatch],
  );

  // ── hasActiveFilters ─────────────────────────────────────────────────────
  // Mirrors the DEFAULT_APPLET_CONSUMER_STATE comparisons; if any field
  // diverges from its default the user has an active filter.
  const d = DEFAULT_APPLET_CONSUMER_STATE;
  const hasActiveFilters =
    consumer.searchTerm !== d.searchTerm ||
    consumer.tab !== d.tab ||
    consumer.sortBy !== d.sortBy ||
    consumer.includedCats.length > 0 ||
    consumer.includedTags.length > 0 ||
    consumer.archFilter !== d.archFilter ||
    consumer.visibilityFilter !== d.visibilityFilter;

  return {
    // Read
    tab: consumer.tab,
    sortBy: consumer.sortBy,
    searchTerm: consumer.searchTerm,
    includedCats: consumer.includedCats,
    includedTags: consumer.includedTags,
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
    loadMoreList,
    resetFilters,
  };
}
