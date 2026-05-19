/**
 * Resolves a `CodeAgentFilter` (stored in user preferences) into a concrete
 * list of `AgentDefinitionRecord`s. Generic enough to drive any UI that
 * wants to narrow the agent roster — the /code workspace's Chat + History
 * slots are the first consumers; future surfaces (app-builder chat, task
 * canvas, etc.) can reuse this without duplicating logic.
 */

import { createSelector } from "@reduxjs/toolkit";
import type { RootState } from "@/lib/redux/store";
import type { CodeAgentFilter } from "@/lib/redux/preferences/userPreferencesSlice";
import type { AgentDefinitionRecord } from "@/features/agents/types/agent-definition.types";
import { selectActiveAgents } from "@/features/agents/redux/agent-definition/selectors";

/**
 * Returns the subset of `selectActiveAgents` that matches the given filter.
 * Pass `null`/`undefined`/`mode === "all"` to get the full list.
 *
 * Reselect memoizes the *inner* computation, but the factory returns a
 * fresh selector instance per call — so consumers should `useMemo` the
 * selector (keyed on the filter object reference) to avoid re-creating it
 * every render.
 */
export const makeSelectAgentsForFilter = () =>
  createSelector(
    [
      selectActiveAgents,
      (_state: RootState, filter: CodeAgentFilter | null | undefined) => filter,
    ],
    (agents, filter): AgentDefinitionRecord[] => {
      if (!filter || filter.mode === "all") return agents;

      switch (filter.mode) {
        case "favorites":
          return agents.filter((a) => a.isFavorite);
        case "tags": {
          if (filter.tags.length === 0) return agents;
          const wanted = new Set(filter.tags);
          return agents.filter((a) => a.tags?.some((t) => wanted.has(t)));
        }
        case "categories": {
          if (filter.categories.length === 0) return agents;
          const wanted = new Set(filter.categories);
          return agents.filter((a) => a.category && wanted.has(a.category));
        }
        case "explicit": {
          if (filter.agentIds.length === 0) return agents;
          const wanted = new Set(filter.agentIds);
          return agents.filter((a) => wanted.has(a.id));
        }
        default:
          return agents;
      }
    },
  );

/**
 * Convenience shorthand: returns just the ids that match the filter. Useful
 * for passing into `ConversationHistorySidebar`'s `agentIds` prop.
 */
export const makeSelectAgentIdsForFilter = () => {
  const selectAgents = makeSelectAgentsForFilter();
  return createSelector(
    [
      (state: RootState, filter: CodeAgentFilter | null | undefined) =>
        selectAgents(state, filter),
    ],
    (agents): string[] => agents.map((a) => a.id),
  );
};

/** Describes why a filter produced zero matches (for empty-state messaging). */
export function describeEmptyFilter(
  filter: CodeAgentFilter | null | undefined,
): string | null {
  if (!filter || filter.mode === "all") return null;
  switch (filter.mode) {
    case "favorites":
      return "No favorite agents yet — star an agent to see it here.";
    case "tags":
      return filter.tags.length === 0
        ? "No tags selected — add one or switch the filter to 'All'."
        : `No agents tagged with ${filter.tags.map((t) => `"${t}"`).join(", ")}.`;
    case "categories":
      return filter.categories.length === 0
        ? "No categories selected — add one or switch the filter to 'All'."
        : `No agents in ${filter.categories.join(", ")}.`;
    case "explicit":
      return filter.agentIds.length === 0
        ? "Filter is set to explicit but no agents are selected."
        : "None of the selected agents are available.";
    default:
      return null;
  }
}

/** Friendly human-readable filter label for buttons/badges. */
export function describeFilter(
  filter: CodeAgentFilter | null | undefined,
): string {
  if (!filter || filter.mode === "all") return "All agents";
  switch (filter.mode) {
    case "favorites":
      return "Favorites";
    case "tags":
      return filter.tags.length === 0
        ? "Tags (none)"
        : `Tags: ${filter.tags.slice(0, 2).join(", ")}${filter.tags.length > 2 ? "…" : ""}`;
    case "categories":
      return filter.categories.length === 0
        ? "Categories (none)"
        : `Categories: ${filter.categories.slice(0, 2).join(", ")}${filter.categories.length > 2 ? "…" : ""}`;
    case "explicit":
      return `Specific (${filter.agentIds.length})`;
    default:
      return "All agents";
  }
}
