"use client";

/**
 * Wires a component to the agent cache + per-consumer filter state.
 *
 * Usage:
 *   const consumer = useAgentCacheConsumer("agent-picker");
 *   consumer.owned / .builtins / .shared — filtered agent lists
 *   consumer.selectAgent(id, source, onSelect) — fetch operational + callback
 */

import { useEffect, useCallback, useMemo, useRef } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  registerAgentConsumer,
  unregisterAgentConsumer,
  setAgentConsumerFilter,
  setAgentConsumerPage,
  resetAgentConsumerFilters,
  selectAgentConsumer,
  DEFAULT_AGENT_CONSUMER_STATE,
  type AgentConsumerState,
  type AgentSortOption,
  type AgentTab,
  type AgentFavFilter,
  type AgentArchFilter,
} from "@/features/agents/redux/agent-consumers/slice";
import {
  selectAgentFetchStatus,
  selectOwnedHasMore,
  selectSharedHasMore,
  selectOwnedCursor,
  type AgentRecord,
  type AgentSource,
} from "@/lib/redux/slices/agentCacheSlice";
import {
  makeSelectFilteredOwnedAgents,
  makeSelectFilteredBuiltinAgents,
  makeSelectFilteredSharedAgents,
  makeSelectAgentSlimList,
  makeSelectAgentHasActiveFilters,
} from "@/lib/redux/selectors/agentSelectors";
import {
  initializeAgents,
  fetchAgentSlimList,
  fetchAgentCoreBatch,
  fetchAgentOperational,
  refreshAgents,
  isTabStale,
} from "@/lib/redux/thunks/agentFetchThunks";

export type {
  AgentSortOption,
  AgentTab,
  AgentFavFilter,
  AgentArchFilter,
  AgentRecord,
  AgentSource,
};

const EMPTY_ARRAY: never[] = [];
const SELECT_NULL = () => null as null;
const SELECT_EMPTY_ARRAY = () => EMPTY_ARRAY;

export interface UseAgentCacheConsumerOptions {
  ephemeral?: boolean;
  mode?: "filtered" | "slim";
  slimLimits?: {
    ownedLimit?: number;
    builtinLimit?: number;
    sharedLimit?: number;
  };
  autoUpgradeToCore?: boolean;
}

export interface AgentCacheConsumerReturn {
  owned: AgentRecord[];
  builtins: AgentRecord[];
  shared: AgentRecord[];
  isLoading: boolean;
  ownedHasMore: boolean;
  sharedHasMore: boolean;
  tab: AgentConsumerState["tab"];
  sortBy: AgentConsumerState["sortBy"];
  searchTerm: AgentConsumerState["searchTerm"];
  includedCats: AgentConsumerState["includedCats"];
  includedTags: AgentConsumerState["includedTags"];
  favFilter: AgentConsumerState["favFilter"];
  archFilter: AgentConsumerState["archFilter"];
  favoritesFirst: AgentConsumerState["favoritesFirst"];
  hasActiveFilters: boolean;
  isSearching: boolean;
  setSearchTerm: (v: string) => void;
  setSortBy: (v: AgentSortOption) => void;
  setTab: (v: AgentTab) => void;
  setFavFilter: (v: AgentFavFilter) => void;
  setArchFilter: (v: AgentArchFilter) => void;
  setIncludedCats: (v: string[]) => void;
  setIncludedTags: (v: string[]) => void;
  setFavoritesFirst: (v: boolean) => void;
  setFilter: (
    patch: Partial<Omit<AgentConsumerState, "listPage" | "sharedPage">>,
  ) => void;
  resetFilters: () => void;
  loadMoreOwned: () => void;
  loadMoreShared: () => void;
  selectAgent: (
    id: string,
    source: AgentSource,
    onSelect: (agent: AgentRecord) => void,
  ) => Promise<void>;
  refresh: () => void;
}

export function useAgentCacheConsumer(
  consumerId: string,
  options: UseAgentCacheConsumerOptions = {},
): AgentCacheConsumerReturn {
  const {
    ephemeral = false,
    mode = "filtered",
    slimLimits = {},
    autoUpgradeToCore = false,
  } = options;

  const dispatch = useAppDispatch();
  const lastVisible = useRef<number>(Date.now());

  useEffect(() => {
    dispatch(registerAgentConsumer(consumerId));
    return () => {
      if (ephemeral) dispatch(unregisterAgentConsumer(consumerId));
    };
  }, [dispatch, consumerId, ephemeral]);

  useEffect(() => {
    dispatch(initializeAgents());
  }, [dispatch]);

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === "hidden") {
        lastVisible.current = Date.now();
        return;
      }
      dispatch((_, getState) => {
        if (isTabStale(getState())) {
          dispatch(refreshAgents());
        }
      });
    };

    document.addEventListener("visibilitychange", handleVisibility);
    return () =>
      document.removeEventListener("visibilitychange", handleVisibility);
  }, [dispatch]);

  const rawOwnedIds = useAppSelector(
    (state) => state.agentCache?.ownedIds ?? EMPTY_ARRAY,
  );
  const rawBuiltinIds = useAppSelector(
    (state) => state.agentCache?.builtinIds ?? EMPTY_ARRAY,
  );
  const rawSharedIds = useAppSelector(
    (state) => state.agentCache?.sharedIds ?? EMPTY_ARRAY,
  );

  useEffect(() => {
    if (!autoUpgradeToCore) return;
    const allIds = [
      ...rawOwnedIds.map((id) => ({ id, source: "prompts" as AgentSource })),
      ...rawBuiltinIds.map((id) => ({ id, source: "builtins" as AgentSource })),
      ...rawSharedIds.map((id) => ({ id, source: "shared" as AgentSource })),
    ];
    if (allIds.length > 0) {
      dispatch(fetchAgentCoreBatch({ agents: allIds }));
    }
  }, [
    dispatch,
    autoUpgradeToCore,
    rawOwnedIds.length,
    rawBuiltinIds.length,
    rawSharedIds.length,
  ]);

  const selectFiltered = useMemo(() => {
    if (mode === "slim") {
      return {
        slim: makeSelectAgentSlimList(consumerId, slimLimits),
        owned: null as null,
        builtins: null as null,
        shared: null as null,
      };
    }
    return {
      slim: null as null,
      owned: makeSelectFilteredOwnedAgents(consumerId),
      builtins: makeSelectFilteredBuiltinAgents(consumerId),
      shared: makeSelectFilteredSharedAgents(consumerId),
    };
  }, [consumerId, mode, slimLimits]);

  const selectHasActiveFilters = useMemo(
    () => makeSelectAgentHasActiveFilters(consumerId),
    [consumerId],
  );

  const consumer = useAppSelector((state) =>
    selectAgentConsumer(state, consumerId),
  );
  const fetchStatus = useAppSelector(selectAgentFetchStatus);
  const ownedHasMore = useAppSelector(selectOwnedHasMore);
  const sharedHasMore = useAppSelector(selectSharedHasMore);
  const ownedCursor = useAppSelector(selectOwnedCursor);
  const hasActiveFilters = useAppSelector(selectHasActiveFilters);

  const slimData = useAppSelector(selectFiltered.slim ?? SELECT_NULL);
  const ownedFiltered = useAppSelector(
    selectFiltered.owned ?? SELECT_EMPTY_ARRAY,
  );
  const builtinsFiltered = useAppSelector(
    selectFiltered.builtins ?? SELECT_EMPTY_ARRAY,
  );
  const sharedFiltered = useAppSelector(
    selectFiltered.shared ?? SELECT_EMPTY_ARRAY,
  );

  const owned =
    mode === "slim" ? (slimData?.owned ?? EMPTY_ARRAY) : ownedFiltered;
  const builtins =
    mode === "slim" ? (slimData?.builtins ?? EMPTY_ARRAY) : builtinsFiltered;
  const shared =
    mode === "slim" ? (slimData?.shared ?? EMPTY_ARRAY) : sharedFiltered;

  const isLoading =
    fetchStatus.owned === "loading" ||
    fetchStatus.builtins === "loading" ||
    fetchStatus.shared === "loading";

  const setFilter = useCallback(
    (patch: Partial<Omit<AgentConsumerState, "listPage" | "sharedPage">>) => {
      dispatch(setAgentConsumerFilter({ consumerId, patch }));
    },
    [dispatch, consumerId],
  );

  const setSearchTerm = useCallback(
    (v: string) => setFilter({ searchTerm: v }),
    [setFilter],
  );
  const setSortBy = useCallback(
    (v: AgentSortOption) => setFilter({ sortBy: v }),
    [setFilter],
  );
  const setTab = useCallback(
    (v: AgentTab) => setFilter({ tab: v }),
    [setFilter],
  );
  const setFavFilter = useCallback(
    (v: AgentFavFilter) => setFilter({ favFilter: v }),
    [setFilter],
  );
  const setArchFilter = useCallback(
    (v: AgentArchFilter) => setFilter({ archFilter: v }),
    [setFilter],
  );
  const setIncludedCats = useCallback(
    (v: string[]) => setFilter({ includedCats: v }),
    [setFilter],
  );
  const setIncludedTags = useCallback(
    (v: string[]) => setFilter({ includedTags: v }),
    [setFilter],
  );
  const setFavoritesFirst = useCallback(
    (v: boolean) => setFilter({ favoritesFirst: v }),
    [setFilter],
  );

  const resetFilters = useCallback(
    () => dispatch(resetAgentConsumerFilters(consumerId)),
    [dispatch, consumerId],
  );

  const loadMoreOwned = useCallback(() => {
    if (!ownedHasMore) return;
    dispatch(fetchAgentSlimList({ source: "owned", cursor: ownedCursor }));
    dispatch(
      setAgentConsumerPage({
        consumerId,
        which: "list",
        page: consumer.listPage + 1,
      }),
    );
  }, [dispatch, consumerId, ownedHasMore, ownedCursor, consumer.listPage]);

  const loadMoreShared = useCallback(() => {
    if (!sharedHasMore) return;
    dispatch(fetchAgentSlimList({ source: "shared" }));
    dispatch(
      setAgentConsumerPage({
        consumerId,
        which: "shared",
        page: consumer.sharedPage + 1,
      }),
    );
  }, [dispatch, consumerId, sharedHasMore, consumer.sharedPage]);

  const selectAgent = useCallback(
    async (
      id: string,
      source: AgentSource,
      onSelect: (agent: AgentRecord) => void,
    ) => {
      const result = await dispatch(
        fetchAgentOperational({ id, source }),
      ).unwrap();
      if (result) onSelect(result);
    },
    [dispatch],
  );

  const refresh = useCallback(() => {
    dispatch(refreshAgents());
  }, [dispatch]);

  return {
    owned,
    builtins,
    shared,
    isLoading,
    ownedHasMore,
    sharedHasMore,
    tab: consumer.tab ?? DEFAULT_AGENT_CONSUMER_STATE.tab,
    sortBy: consumer.sortBy ?? DEFAULT_AGENT_CONSUMER_STATE.sortBy,
    searchTerm: consumer.searchTerm ?? DEFAULT_AGENT_CONSUMER_STATE.searchTerm,
    includedCats:
      consumer.includedCats ?? DEFAULT_AGENT_CONSUMER_STATE.includedCats,
    includedTags:
      consumer.includedTags ?? DEFAULT_AGENT_CONSUMER_STATE.includedTags,
    favFilter: consumer.favFilter ?? DEFAULT_AGENT_CONSUMER_STATE.favFilter,
    archFilter: consumer.archFilter ?? DEFAULT_AGENT_CONSUMER_STATE.archFilter,
    favoritesFirst:
      consumer.favoritesFirst ?? DEFAULT_AGENT_CONSUMER_STATE.favoritesFirst,
    hasActiveFilters,
    isSearching: (consumer.searchTerm ?? "").length > 0,
    setSearchTerm,
    setSortBy,
    setTab,
    setFavFilter,
    setArchFilter,
    setIncludedCats,
    setIncludedTags,
    setFavoritesFirst,
    setFilter,
    resetFilters,
    loadMoreOwned,
    loadMoreShared,
    selectAgent,
    refresh,
  };
}
