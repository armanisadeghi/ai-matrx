// features/agents/redux/agent-consumers/selectors.ts
//
// Memoized selector factories for the agent list system.
//
// All filter, sort, search-scoring, category/tag extraction, and pagination
// logic lives here — not in components. Components call the factory once
// (stable reference across renders when bound to a fixed consumerId) and
// consume the result directly from useAppSelector.
//
// Factory pattern: createSelector is memoized PER INSTANCE.
// Call each factory once outside the component (or inside useMemo with a
// stable consumerId) so React doesn't recreate it on every render.
//
// This mirrors promptSelectors.ts exactly, adapted for agents.
// Key differences from prompts:
//   - Agents have access metadata (isOwner, accessLevel, sharedByEmail)
//   - Agents have isVersion / parentAgentId (version snapshots vs live agents)
//   - The list search is over agx_get_list() fields ONLY — not messages or
//     variableDefinitions. Those fields are excluded from the basic search to
//     avoid false positives. An advanced search thunk handles message content.
//   - System / builtin agents (agentType = 'builtin') are separated from user agents.

import { createSelector } from "@reduxjs/toolkit";
import type { RootState } from "@/lib/redux/store";
import { selectLiveAgents } from "../agent-definition/selectors";
import {
  selectAgentConsumer,
  DEFAULT_AGENT_CONSUMER_STATE,
  AGENT_NONE_SENTINEL,
} from "./slice";
import type { AgentConsumerState, AgentSortOption } from "./slice";
import type { AgentDefinitionRecord } from "../../types/agent-definition.types";

// ── Constants ──────────────────────────────────────────────────────────────────

export const AGENT_CARDS_LIMIT_DESKTOP = 8;
export const AGENT_CARDS_LIMIT_MOBILE = 4;
export const AGENT_LIST_ITEMS_PER_PAGE = 20;

// ── Pure scoring / filtering helpers ──────────────────────────────────────────
// Pure functions — no Redux dependency. Components should never reimplement these.

/**
 * Compute a relevance score for an agent against a lower-cased query.
 * Higher = more relevant.
 *
 * Only searches fields returned by agx_get_list():
 *   name, description, category, tags, modelId, id, agentType
 *
 * Does NOT search messages or variableDefinitions — those are not loaded
 * from the list fetch and would produce false positives if they were.
 * Use an advanced search thunk to search message content.
 */
export function computeAgentSearchScore(
  agent: AgentDefinitionRecord,
  query: string,
): number {
  const q = query.toLowerCase();
  let score = 0;

  const name = (agent.name ?? "").toLowerCase();
  const desc = (agent.description ?? "").toLowerCase();

  if (name === q) score += 10000;
  else if (name.startsWith(q)) score += 5000;
  else if (name.includes(q)) score += 2000;

  if (desc === q) score += 1000;
  else if (desc.includes(q)) score += 500;

  if (agent.category?.toLowerCase().includes(q)) score += 300;
  if (agent.tags?.some((t) => t.toLowerCase().includes(q))) score += 300;
  if (agent.modelId?.toLowerCase().includes(q)) score += 100;
  if (agent.agentType?.toLowerCase().includes(q)) score += 100;

  // ID search — exact UUID match ranks highest so you can always find an agent by its id
  if (agent.id?.toLowerCase() === q) score += 100000;
  else if (agent.id?.toLowerCase().includes(q)) score += 5000;

  // shared_by_email — helps find agents shared by a specific person
  if (agent.sharedByEmail?.toLowerCase().includes(q)) score += 200;

  return score;
}

export function agentMatchesSearch(
  agent: AgentDefinitionRecord,
  query: string,
): boolean {
  return computeAgentSearchScore(agent, query) > 0;
}

export function applyAgentSortComparator(
  a: AgentDefinitionRecord,
  b: AgentDefinitionRecord,
  sortBy: AgentSortOption,
): number {
  switch (sortBy) {
    case "name-asc":
      return (a.name ?? "").localeCompare(b.name ?? "");
    case "name-desc":
      return (b.name ?? "").localeCompare(a.name ?? "");
    case "created-desc":
      return +new Date(b.createdAt ?? 0) - +new Date(a.createdAt ?? 0);
    case "category-asc":
      return (a.category ?? "").localeCompare(b.category ?? "");
    case "updated-desc":
    default:
      return +new Date(b.updatedAt ?? 0) - +new Date(a.updatedAt ?? 0);
  }
}

// ── Input selector factory (stable per consumerId) ────────────────────────────

const makeSelectAgentConsumerState =
  (consumerId: string) =>
  (state: RootState): AgentConsumerState =>
    state.agentConsumers?.consumers[consumerId] ?? DEFAULT_AGENT_CONSUMER_STATE;

// ── Category / tag metadata (derived from live agents) ────────────────────────

/**
 * All unique categories across live user agents, sorted alphabetically.
 * Single shared instance — no per-consumer factory needed.
 */
export const selectAllAgentCategories = createSelector(
  selectLiveAgents,
  (agents): string[] => {
    const cats = new Set<string>();
    for (const a of agents) {
      if (a.agentType === "user" && a.category) cats.add(a.category);
    }
    return Array.from(cats).sort();
  },
);

/**
 * All unique tags across live user agents, sorted alphabetically.
 */
export const selectAllAgentTags = createSelector(
  selectLiveAgents,
  (agents): string[] => {
    const tags = new Set<string>();
    for (const a of agents) {
      if (a.agentType === "user") a.tags?.forEach((t) => tags.add(t));
    }
    return Array.from(tags).sort();
  },
);

// ── User-owned + shared agents (excludes builtins) ────────────────────────────

/** Live user-type agents (excludes builtins). These are the ones for the main page. */
const selectUserTypeAgents = createSelector(selectLiveAgents, (agents) =>
  agents.filter((a) => a.agentType === "user"),
);

/** Builtin/system agents only. For chat pickers and full catalogues. */
const selectBuiltinTypeAgents = createSelector(selectLiveAgents, (agents) =>
  agents.filter((a) => a.agentType === "builtin"),
);

// ── Pure filter pipelines (shared by selector factories) ─────────────────────

function sortFilteredAgents(
  filtered: AgentDefinitionRecord[],
  consumer: AgentConsumerState,
): AgentDefinitionRecord[] {
  const { searchTerm, sortBy, favFilter, favoritesFirst } = consumer;

  if (searchTerm) {
    const scores = new Map<string, number>();
    filtered.forEach((a) => {
      scores.set(a.id, computeAgentSearchScore(a, searchTerm));
    });
    return [...filtered].sort((a, b) => {
      const sa = scores.get(a.id) ?? 0;
      const sb = scores.get(b.id) ?? 0;
      if (sb !== sa) return sb - sa;
      return applyAgentSortComparator(a, b, sortBy);
    });
  }

  return [...filtered].sort((a, b) => {
    if (favoritesFirst && favFilter === "all") {
      const aFav = a.isFavorite ? 1 : 0;
      const bFav = b.isFavorite ? 1 : 0;
      if (bFav !== aFav) return bFav - aFav;
    }
    return applyAgentSortComparator(a, b, sortBy);
  });
}

/** User-type agents — mine / shared / all tabs with full consumer filters. */
export function filterUserTypeAgents(
  agents: AgentDefinitionRecord[],
  consumer: AgentConsumerState,
): AgentDefinitionRecord[] {
  const {
    searchTerm,
    includedCats,
    includedTags,
    favFilter,
    archFilter,
    accessFilter,
    tab,
  } = consumer;

  const filtered = agents.filter((agent) => {
    if (tab === "mine" && agent.isOwner !== true) return false;
    if (
      tab === "shared" &&
      !(agent.isOwner === false && agent.accessLevel != null)
    )
      return false;

    if (archFilter === "active" && agent.isArchived) return false;
    if (archFilter === "archived" && !agent.isArchived) return false;

    if (favFilter === "yes" && !agent.isFavorite) return false;
    if (favFilter === "no" && agent.isFavorite) return false;

    if (accessFilter === "owned" && agent.isOwner !== true) return false;
    if (accessFilter === "shared" && agent.isOwner !== false) return false;
    if (
      accessFilter === "editable" &&
      agent.accessLevel !== "owner" &&
      agent.accessLevel !== "admin" &&
      agent.accessLevel !== "editor"
    )
      return false;

    if (includedCats.length > 0) {
      const isUncategorized = !agent.category;
      if (isUncategorized) {
        if (!includedCats.includes(AGENT_NONE_SENTINEL)) return false;
      } else if (!includedCats.includes(agent.category!)) {
        return false;
      }
    }

    if (includedTags.length > 0) {
      const isUntagged = !agent.tags?.length;
      if (isUntagged) {
        if (!includedTags.includes(AGENT_NONE_SENTINEL)) return false;
      } else if (!agent.tags?.some((t) => includedTags.includes(t))) {
        return false;
      }
    }

    if (searchTerm && !agentMatchesSearch(agent, searchTerm)) return false;

    return true;
  });

  return sortFilteredAgents(filtered, consumer);
}

/** Builtin/system agents — search + sort only (tab === "system"). */
export function filterBuiltinTypeAgents(
  agents: AgentDefinitionRecord[],
  consumer: AgentConsumerState,
): AgentDefinitionRecord[] {
  const { searchTerm } = consumer;
  const filtered = searchTerm
    ? agents.filter((a) => agentMatchesSearch(a, searchTerm))
    : agents;
  return sortFilteredAgents(filtered, consumer);
}

// ── Filtered agents (user + system tabs) ──────────────────────────────────────

/**
 * Factory: owned user-type agents with consumer filters applied (ignores tab).
 * Used by the agents gallery "Mine" tab and the owned section of "All".
 */
export const makeSelectFilteredOwnedAgents = (consumerId: string) =>
  createSelector(
    selectUserTypeAgents,
    makeSelectAgentConsumerState(consumerId),
    (userAgents, consumer): AgentDefinitionRecord[] =>
      filterUserTypeAgents(userAgents, { ...consumer, tab: "mine" }),
  );

/**
 * Factory: shared user-type agents with consumer filters applied (ignores tab).
 * Used by the agents gallery "Shared" tab and the shared section of "All".
 */
export const makeSelectFilteredSharedAgents = (consumerId: string) =>
  createSelector(
    selectUserTypeAgents,
    makeSelectAgentConsumerState(consumerId),
    (userAgents, consumer): AgentDefinitionRecord[] =>
      filterUserTypeAgents(userAgents, { ...consumer, tab: "shared" }),
  );

/**
 * Factory: returns a memoized selector that filters and sorts agents for a
 * consumer. User tabs (mine / shared / all) draw from user-type agents;
 * the system tab draws from builtins.
 */
export const makeSelectFilteredAgents = (consumerId: string) =>
  createSelector(
    selectUserTypeAgents,
    selectBuiltinTypeAgents,
    makeSelectAgentConsumerState(consumerId),
    (userAgents, builtinAgents, consumer): AgentDefinitionRecord[] => {
      if (consumer.tab === "system") {
        return filterBuiltinTypeAgents(builtinAgents, consumer);
      }
      return filterUserTypeAgents(userAgents, consumer);
    },
  );

// ── Builtin / system agent filtering (for chat pickers) ───────────────────────

/**
 * Factory: filters and sorts builtin agents for the chat agent picker.
 * Only searches name, description, category, tags — same as user agents.
 * No tab/access/archive/favorite filters (builtins are always active and public).
 */
export const makeSelectFilteredBuiltinAgents = (consumerId: string) =>
  createSelector(
    selectBuiltinTypeAgents,
    makeSelectAgentConsumerState(consumerId),
    (agents, consumer): AgentDefinitionRecord[] =>
      filterBuiltinTypeAgents(agents, consumer),
  );

// ── Card / list split ─────────────────────────────────────────────────────────

/**
 * Factory: slices filtered owned agents into the "cards" hero section.
 * isMobile toggles the card limit.
 */
export const makeSelectOwnedAgentCards = (
  consumerId: string,
  isMobile: boolean,
) => {
  const selectFiltered = makeSelectFilteredOwnedAgents(consumerId);
  const limit = isMobile ? AGENT_CARDS_LIMIT_MOBILE : AGENT_CARDS_LIMIT_DESKTOP;
  return createSelector(selectFiltered, (filtered): AgentDefinitionRecord[] =>
    filtered.slice(0, limit),
  );
};

/** @deprecated Use makeSelectOwnedAgentCards — kept for call-site clarity during migration. */
export const makeSelectAgentCards = makeSelectOwnedAgentCards;

/**
 * Factory: paginated list items for owned agents (everything after cards).
 * Returns items for the current page plus pagination metadata.
 */
export const makeSelectOwnedAgentListItems = (
  consumerId: string,
  isMobile: boolean,
) => {
  const selectFiltered = makeSelectFilteredOwnedAgents(consumerId);
  const limit = isMobile ? AGENT_CARDS_LIMIT_MOBILE : AGENT_CARDS_LIMIT_DESKTOP;
  return createSelector(
    selectFiltered,
    makeSelectAgentConsumerState(consumerId),
    (
      filtered,
      consumer,
    ): {
      items: AgentDefinitionRecord[];
      hasMore: boolean;
      totalAfterCards: number;
    } => {
      const afterCards = filtered.slice(limit);
      const pageEnd = consumer.listPage * AGENT_LIST_ITEMS_PER_PAGE;
      const items = afterCards.slice(0, pageEnd);
      return {
        items,
        hasMore: items.length < afterCards.length,
        totalAfterCards: afterCards.length,
      };
    },
  );
};

/** @deprecated Use makeSelectOwnedAgentListItems. */
export const makeSelectAgentListItems = makeSelectOwnedAgentListItems;

/**
 * Factory: slices filtered shared agents into the "cards" hero section.
 */
export const makeSelectSharedAgentCards = (
  consumerId: string,
  isMobile: boolean,
) => {
  const selectFiltered = makeSelectFilteredSharedAgents(consumerId);
  const limit = isMobile ? AGENT_CARDS_LIMIT_MOBILE : AGENT_CARDS_LIMIT_DESKTOP;
  return createSelector(selectFiltered, (filtered): AgentDefinitionRecord[] =>
    filtered.slice(0, limit),
  );
};

/**
 * Factory: paginated list items for shared agents (everything after cards).
 */
export const makeSelectSharedAgentListItems = (
  consumerId: string,
  isMobile: boolean,
) => {
  const selectFiltered = makeSelectFilteredSharedAgents(consumerId);
  const limit = isMobile ? AGENT_CARDS_LIMIT_MOBILE : AGENT_CARDS_LIMIT_DESKTOP;
  return createSelector(
    selectFiltered,
    makeSelectAgentConsumerState(consumerId),
    (
      filtered,
      consumer,
    ): {
      items: AgentDefinitionRecord[];
      hasMore: boolean;
      totalAfterCards: number;
    } => {
      const afterCards = filtered.slice(limit);
      const pageEnd = consumer.sharedPage * AGENT_LIST_ITEMS_PER_PAGE;
      const items = afterCards.slice(0, pageEnd);
      return {
        items,
        hasMore: items.length < afterCards.length,
        totalAfterCards: afterCards.length,
      };
    },
  );
};

// ── Convenience count selectors ───────────────────────────────────────────────

/** Factory: total count of filtered user agents for a consumer. */
export const makeSelectFilteredAgentsCount = (consumerId: string) => {
  const selectFiltered = makeSelectFilteredAgents(consumerId);
  return createSelector(selectFiltered, (filtered) => filtered.length);
};

/** Factory: total count of filtered builtin agents for a consumer. */
export const makeSelectFilteredBuiltinAgentsCount = (consumerId: string) => {
  const selectFiltered = makeSelectFilteredBuiltinAgents(consumerId);
  return createSelector(selectFiltered, (filtered) => filtered.length);
};

// ── Consumer state convenience selectors ─────────────────────────────────────

/** Returns whether a consumer has any non-default filters active. */
export const makeSelectAgentConsumerHasActiveFilters = (consumerId: string) =>
  createSelector(
    makeSelectAgentConsumerState(consumerId),
    (consumer): boolean =>
      consumer.tab !== DEFAULT_AGENT_CONSUMER_STATE.tab ||
      consumer.sortBy !== DEFAULT_AGENT_CONSUMER_STATE.sortBy ||
      consumer.searchTerm !== "" ||
      consumer.includedCats.length > 0 ||
      consumer.includedTags.length > 0 ||
      consumer.favFilter !== DEFAULT_AGENT_CONSUMER_STATE.favFilter ||
      consumer.archFilter !== DEFAULT_AGENT_CONSUMER_STATE.archFilter ||
      consumer.accessFilter !== DEFAULT_AGENT_CONSUMER_STATE.accessFilter ||
      consumer.favoritesFirst !== DEFAULT_AGENT_CONSUMER_STATE.favoritesFirst,
  );

/** Returns the current search term for a consumer. */
export const makeSelectAgentSearchTerm = (consumerId: string) =>
  createSelector(
    makeSelectAgentConsumerState(consumerId),
    (consumer) => consumer.searchTerm,
  );

/** Returns the current sort option for a consumer. */
export const makeSelectAgentSortBy = (consumerId: string) =>
  createSelector(
    makeSelectAgentConsumerState(consumerId),
    (consumer) => consumer.sortBy,
  );

/** Returns the current active tab for a consumer. */
export const makeSelectAgentTab = (consumerId: string) =>
  createSelector(
    makeSelectAgentConsumerState(consumerId),
    (consumer) => consumer.tab,
  );

// ── Aggregate counts (for tab badges) ────────────────────────────────────────

/**
 * Total live user-type agents in state.
 * Used for tab badge counts on the agents page.
 */
export const selectTotalUserAgentsCount = createSelector(
  selectUserTypeAgents,
  (agents) => agents.length,
);

export const selectTotalOwnedAgentsCount = createSelector(
  selectUserTypeAgents,
  (agents) => agents.filter((a) => a.isOwner === true).length,
);

export const selectTotalSharedAgentsCount = createSelector(
  selectUserTypeAgents,
  (agents) =>
    agents.filter((a) => a.isOwner === false && a.accessLevel != null).length,
);

export const selectTotalBuiltinAgentsCount = createSelector(
  selectBuiltinTypeAgents,
  (agents) => agents.length,
);

export const selectTotalFavoriteAgentsCount = createSelector(
  selectUserTypeAgents,
  (agents) => agents.filter((a) => a.isFavorite).length,
);
