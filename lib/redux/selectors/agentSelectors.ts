// lib/redux/selectors/agentSelectors.ts
//
// Memoized selector factories for the agent cache system.
//
// Pattern mirrors promptSelectors.ts — factories are bound to a consumerId so
// multiple UI instances have completely independent memoization caches.
//
// Usage:
//   // Create once outside component or in useMemo with stable consumerId
//   const selectMyAgents = makeSelectFilteredAgents("agent-picker");
//   const agents = useAppSelector(selectMyAgents);

import { createSelector } from "@reduxjs/toolkit";
import type { RootState } from "@/lib/redux/store";
import {
  selectAllAgentsById,
  selectOwnedAgentIds,
  selectBuiltinAgentIds,
  selectSharedAgentIds,
  selectOwnedAgents,
  selectBuiltinAgents,
  selectSharedAgents,
  selectAgentById,
  AgentRecord,
  AgentSource,
} from "../slices/agentCacheSlice";
import {
  selectAgentConsumer,
  DEFAULT_AGENT_CONSUMER_STATE,
} from "@/features/agents/redux/agent-consumers/slice";
import type {
  AgentConsumerState,
  AgentSortOption,
} from "@/features/agents/redux/agent-consumers/slice";

// ── Constants ─────────────────────────────────────────────────────────────────

export const AGENT_SIDEBAR_LIMIT = 6; // total across owned + builtins + shared
export const AGENTS_PER_PAGE = 24;

// ── Pure helpers ──────────────────────────────────────────────────────────────

/**
 * Relevance score for an AgentRecord against a lower-cased search query.
 * Higher = more relevant. Returns 0 if no match.
 */
export function computeAgentSearchScore(
  agent: AgentRecord,
  query: string,
): number {
  const q = query.toLowerCase();
  let score = 0;
  const name = agent.name.toLowerCase();
  const desc = (agent.description ?? "").toLowerCase();

  if (name === q) score += 10000;
  else if (name.startsWith(q)) score += 5000;
  else if (name.includes(q)) score += 2000;

  if (desc === q) score += 1000;
  else if (desc.includes(q)) score += 500;

  if (agent.category?.toLowerCase().includes(q)) score += 300;
  if (agent.tags?.some((t) => t.toLowerCase().includes(q))) score += 300;
  if (agent.outputFormat?.toLowerCase().includes(q)) score += 100;
  if (agent.id.toLowerCase().includes(q)) score += 50;

  return score;
}

export function agentMatchesSearch(agent: AgentRecord, query: string): boolean {
  return computeAgentSearchScore(agent, query) > 0;
}

export function applyAgentSort(
  a: AgentRecord,
  b: AgentRecord,
  sortBy: AgentSortOption,
): number {
  switch (sortBy) {
    case "name-asc":
      return a.name.localeCompare(b.name);
    case "name-desc":
      return b.name.localeCompare(a.name);
    case "updated-desc":
      return (b.updatedAt ?? "").localeCompare(a.updatedAt ?? "");
    case "created-desc":
      return (b.createdAt ?? "").localeCompare(a.createdAt ?? "");
    case "category-asc":
      return (a.category ?? "").localeCompare(b.category ?? "");
    default:
      return a.name.localeCompare(b.name);
  }
}

/** Returns true if an agent passes the category/tag/archive/fav filters from consumer state. */
export function agentPassesFilters(
  agent: AgentRecord,
  consumer: AgentConsumerState,
): boolean {
  const { searchTerm, includedCats, includedTags, favFilter, archFilter } =
    consumer;

  if (searchTerm && !agentMatchesSearch(agent, searchTerm)) return false;

  if (archFilter === "active" && agent.isArchived) return false;
  if (archFilter === "archived" && !agent.isArchived) return false;

  if (favFilter === "yes" && !agent.isFavorite) return false;
  if (favFilter === "no" && agent.isFavorite) return false;

  if (includedCats.length > 0) {
    const cat = agent.category ?? "";
    if (!includedCats.includes(cat)) return false;
  }

  if (includedTags.length > 0) {
    const tags = agent.tags ?? [];
    if (!includedTags.some((t) => tags.includes(t))) return false;
  }

  return true;
}

// ── Shared base selectors ─────────────────────────────────────────────────────
// Re-export these for convenience in components that don't need filtering

export {
  selectOwnedAgents,
  selectBuiltinAgents,
  selectSharedAgents,
  selectAgentById,
  selectAllAgentsById,
  selectOwnedAgentIds,
  selectBuiltinAgentIds,
  selectSharedAgentIds,
};

/** All three sources merged into a single flat array — slim access only. */
export const selectAllAgents = createSelector(
  selectOwnedAgents,
  selectBuiltinAgents,
  selectSharedAgents,
  (owned, builtins, shared): AgentRecord[] => [
    ...owned,
    ...builtins,
    ...shared,
  ],
);

/** All unique categories present in the agent cache (core+ only). */
export const selectAllAgentCategories = createSelector(
  selectAllAgents,
  (agents): string[] => {
    const cats = new Set<string>();
    for (const a of agents) {
      if (a.category) cats.add(a.category);
    }
    return Array.from(cats).sort();
  },
);

/** All unique tags present in the agent cache (core+ only). */
export const selectAllAgentTags = createSelector(
  selectAllAgents,
  (agents): string[] => {
    const tags = new Set<string>();
    for (const a of agents) {
      for (const t of a.tags ?? []) tags.add(t);
    }
    return Array.from(tags).sort();
  },
);

// ── Consumer-specific selector factories ─────────────────────────────────────
//
// Call each factory ONCE outside the component (or in useMemo with a stable
// consumerId). Each call returns a brand-new memoized selector so multiple
// consumers never share or invalidate each other's cache.

/** Make a selector for the consumer's filter state from agentConsumers slice. */
export const makeSelectAgentConsumerState =
  (consumerId: string) =>
  (state: RootState): AgentConsumerState =>
    selectAgentConsumer(state, consumerId);

/**
 * Factory: filtered + sorted list of owned agents for a given consumer.
 * Applies all filter/sort state from agentConsumers slice.
 * Requires agents at core depth for category/tag/archive filtering.
 * Falls back gracefully for slim records (no category/tag filtering applied).
 */
export const makeSelectFilteredOwnedAgents = (consumerId: string) =>
  createSelector(
    selectOwnedAgents,
    (state: RootState) => selectAgentConsumer(state, consumerId),
    (agents, consumer): AgentRecord[] => {
      const { searchTerm, sortBy, favoritesFirst } = consumer;

      let filtered = agents.filter((a) => agentPassesFilters(a, consumer));

      if (searchTerm) {
        filtered = filtered
          .map((a) => ({
            agent: a,
            score: computeAgentSearchScore(a, searchTerm),
          }))
          .sort((a, b) => b.score - a.score)
          .map(({ agent }) => agent);
      } else {
        filtered.sort((a, b) => {
          if (favoritesFirst) {
            if (a.isFavorite && !b.isFavorite) return -1;
            if (!a.isFavorite && b.isFavorite) return 1;
          }
          return applyAgentSort(a, b, sortBy);
        });
      }

      return filtered;
    },
  );

/**
 * Factory: filtered + sorted list of builtin agents for a given consumer.
 */
export const makeSelectFilteredBuiltinAgents = (consumerId: string) =>
  createSelector(
    selectBuiltinAgents,
    (state: RootState) => selectAgentConsumer(state, consumerId),
    (agents, consumer): AgentRecord[] => {
      const { searchTerm, sortBy } = consumer;

      // Only show active builtins by default
      let filtered = agents.filter((a) => {
        if (a.isActive === false) return false;
        return agentPassesFilters(a, { ...consumer, archFilter: "active" });
      });

      if (searchTerm) {
        filtered = filtered
          .map((a) => ({
            agent: a,
            score: computeAgentSearchScore(a, searchTerm),
          }))
          .sort((a, b) => b.score - a.score)
          .map(({ agent }) => agent);
      } else {
        filtered.sort((a, b) => applyAgentSort(a, b, sortBy));
      }

      return filtered;
    },
  );

/**
 * Factory: filtered + sorted list of shared agents for a given consumer.
 */
export const makeSelectFilteredSharedAgents = (consumerId: string) =>
  createSelector(
    selectSharedAgents,
    (state: RootState) => selectAgentConsumer(state, consumerId),
    (agents, consumer): AgentRecord[] => {
      const { searchTerm, sortBy } = consumer;

      let filtered = agents.filter((a) => agentPassesFilters(a, consumer));

      if (searchTerm) {
        filtered = filtered
          .map((a) => ({
            agent: a,
            score: computeAgentSearchScore(a, searchTerm),
          }))
          .sort((a, b) => b.score - a.score)
          .map(({ agent }) => agent);
      } else {
        filtered.sort((a, b) => applyAgentSort(a, b, sortBy));
      }

      return filtered;
    },
  );

/**
 * Factory: slim list of agents for sidebar display (Layer 1 only).
 * Returns a capped slice of owned + builtins + shared, suitable for
 * the chat sidebar before the user expands or searches.
 *
 * Default cap: 3 per source (9 total) — consumers can override via options.
 */
export const makeSelectAgentSlimList = (
  consumerId: string,
  options: {
    ownedLimit?: number;
    builtinLimit?: number;
    sharedLimit?: number;
  } = {},
) =>
  createSelector(
    selectOwnedAgents,
    selectBuiltinAgents,
    selectSharedAgents,
    (state: RootState) => selectAgentConsumer(state, consumerId),
    (
      owned,
      builtins,
      shared,
      consumer,
    ): {
      owned: AgentRecord[];
      builtins: AgentRecord[];
      shared: AgentRecord[];
    } => {
      const ownedLimit = options.ownedLimit ?? 3;
      const builtinLimit = options.builtinLimit ?? 3;
      const sharedLimit = options.sharedLimit ?? 3;

      const { searchTerm } = consumer;

      if (searchTerm) {
        const search = searchTerm.toLowerCase();
        return {
          owned: owned
            .filter((a) => agentMatchesSearch(a, search))
            .slice(0, ownedLimit),
          builtins: builtins
            .filter((a) => agentMatchesSearch(a, search))
            .slice(0, builtinLimit),
          shared: shared
            .filter((a) => agentMatchesSearch(a, search))
            .slice(0, sharedLimit),
        };
      }

      return {
        owned: owned.slice(0, ownedLimit),
        builtins: builtins
          .filter((a) => a.isActive !== false)
          .slice(0, builtinLimit),
        shared: shared.slice(0, sharedLimit),
      };
    },
  );

/**
 * Factory: paginated filtered agents across all sources for the agent picker.
 * Consumer's listPage drives pagination (AGENTS_PER_PAGE items per page).
 */
export const makeSelectFilteredAgents = (consumerId: string) =>
  createSelector(
    makeSelectFilteredOwnedAgents(consumerId),
    makeSelectFilteredBuiltinAgents(consumerId),
    makeSelectFilteredSharedAgents(consumerId),
    (state: RootState) => selectAgentConsumer(state, consumerId),
    (
      owned,
      builtins,
      shared,
      consumer,
    ): {
      owned: AgentRecord[];
      builtins: AgentRecord[];
      shared: AgentRecord[];
      page: number;
    } => {
      const page = consumer.listPage;
      const end = page * AGENTS_PER_PAGE;

      return {
        owned: owned.slice(0, end),
        builtins: builtins,
        shared: shared.slice(0, end),
        page,
      };
    },
  );

/**
 * Factory: whether the consumer has any active filters beyond defaults.
 * Useful for showing a "Clear filters" button.
 */
export const makeSelectAgentHasActiveFilters = (consumerId: string) =>
  createSelector(
    (state: RootState) => selectAgentConsumer(state, consumerId),
    (consumer): boolean => {
      const def = DEFAULT_AGENT_CONSUMER_STATE;
      return (
        consumer.searchTerm !== def.searchTerm ||
        consumer.sortBy !== def.sortBy ||
        consumer.favFilter !== def.favFilter ||
        consumer.archFilter !== def.archFilter ||
        consumer.includedCats.length > 0 ||
        consumer.includedTags.length > 0
      );
    },
  );

/**
 * Simple non-factory selector: find a single agent by id.
 * Use for detail views / operational fetch triggers.
 */
export const makeSelectAgentById =
  (id: string) =>
  (state: RootState): AgentRecord | undefined =>
    state.agentCache?.byId[id];

/** Counts by source — useful for rendering section headers and "X more" labels. */
export const selectAgentCounts = createSelector(
  selectOwnedAgents,
  selectBuiltinAgents,
  selectSharedAgents,
  (owned, builtins, shared) => ({
    owned: owned.length,
    builtins: builtins.length,
    shared: shared.length,
    total: owned.length + builtins.length + shared.length,
  }),
);

/** Returns all unique sources that are currently loaded in the cache. */
export const selectLoadedSources = createSelector(
  selectOwnedAgents,
  selectBuiltinAgents,
  selectSharedAgents,
  (owned, builtins, shared): AgentSource[] => {
    const sources: AgentSource[] = [];
    if (owned.length > 0) sources.push("prompts");
    if (builtins.length > 0) sources.push("builtins");
    if (shared.length > 0) sources.push("shared");
    return sources;
  },
);
