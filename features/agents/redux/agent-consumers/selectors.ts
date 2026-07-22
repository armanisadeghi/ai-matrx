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

// Scoring lives in `features/agents/search/score.ts` — ONE implementation for
// every agent surface. Imported for local use and re-exported so existing
// importers keep working; do not reintroduce a local copy.
import {
  computeAgentSearchScore,
  agentMatchesSearch,
} from "@/features/agents/search/score";

export { computeAgentSearchScore, agentMatchesSearch };

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

    // Server rank, used only to order matches the local scorer cannot see
    // (tier-2 prompt hits). Locally-scored matches all have score > 0, so
    // they sort above this group unconditionally — obvious matches first.
    const serverRank = new Map<string, number>();
    consumer.serverMatchedIds.forEach((id, i) => serverRank.set(id, i));

    return [...filtered].sort((a, b) => {
      const sa = scores.get(a.id) ?? 0;
      const sb = scores.get(b.id) ?? 0;
      if (sb !== sa) return sb - sa;
      if (sa === 0) {
        const ra = serverRank.get(a.id);
        const rb = serverRank.get(b.id);
        if (ra !== undefined && rb !== undefined && ra !== rb) return ra - rb;
      }
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

  // Built once, not per row — this runs on every keystroke over the full list.
  const serverMatched = new Set(consumer.serverMatchedIds);

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
      const category = agent.category;
      if (!category) {
        if (!includedCats.includes(AGENT_NONE_SENTINEL)) return false;
      } else if (!includedCats.includes(category)) {
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

    // A server hit counts as a match even when the local scorer scores 0 —
    // that is the only way tier-2 prompt matches can reach the screen, since
    // the client never loads prompt content to score against.
    if (
      searchTerm &&
      !agentMatchesSearch(agent, searchTerm) &&
      !serverMatched.has(agent.id)
    )
      return false;

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
  const serverMatched = new Set(consumer.serverMatchedIds);
  const filtered = searchTerm
    ? agents.filter(
        (a) => agentMatchesSearch(a, searchTerm) || serverMatched.has(a.id),
      )
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
