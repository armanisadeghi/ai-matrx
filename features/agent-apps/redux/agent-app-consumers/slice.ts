// features/agent-apps/redux/agent-app-consumers/slice.ts
//
// Per-consumer filter, sort, and pagination state for agent-app list UIs.
//
// Mirrors the agent-consumers / promptConsumers pattern exactly. Each distinct
// agent-app list UI (the main /agent-apps page, an agent-detail "apps for this
// agent" view, an org/admin variant, a picker modal, etc.) registers under a
// unique consumerId and gets completely isolated state.
//
// Usage pattern:
//   1. On mount:  dispatch(registerAgentAppConsumer("apps-main"))
//   2. To filter: dispatch(setAgentAppConsumerFilter({ consumerId, patch: { searchTerm: "tutor" } }))
//   3. To select: use makeSelectFilteredApps("apps-main") from selectors.ts
//
// EXTENDING THE FILTER / SORT SET:
// Apps will need many more dimensions over time (success_rate, total_cost,
// last_run, user_feedback, etc). To add one:
//   1. Add the field to AgentAppConsumerState + DEFAULT_AGENT_APP_CONSUMER_STATE.
//   2. Add a setter wrapper to useAgentAppConsumer.
//   3. Add a predicate in selectors.ts (the "Filter predicates" block).
//   4. Add a comparator entry in selectors.ts (the SORT_COMPARATORS map) if
//      it's a sort dimension.
// The shape is intentionally flat so no orchestration is needed — adding a
// dimension is mechanical, never structural.

import { createSlice, PayloadAction } from "@reduxjs/toolkit";

// ── Types ──────────────────────────────────────────────────────────────────────

export type AgentAppSortOption =
  | "updated-desc"
  | "created-desc"
  | "name-asc"
  | "name-desc"
  | "category-asc"
  | "agent-asc"
  | "executions-desc"
  | "last-run-desc";

/** Which ownership tab is active. */
export type AgentAppTab = "mine" | "shared" | "all";

/** Maps onto AgentApp.status. "active" = anything not archived/suspended. */
export type AgentAppArchFilter = "active" | "archived" | "both";

/** Public-vs-private visibility filter. Independent of status. */
export type AgentAppVisibilityFilter = "all" | "public" | "private";

/** Sentinel meaning "include uncategorized / untagged" items. */
export const AGENT_APP_NONE_SENTINEL = "__none__";

export interface AgentAppConsumerState {
  tab: AgentAppTab;
  sortBy: AgentAppSortOption;
  searchTerm: string;

  /** INCLUSION model: empty = show all; non-empty = only matching. */
  includedCats: string[];

  /** INCLUSION model: empty = show all; non-empty = only matching. */
  includedTags: string[];

  /**
   * INCLUSION model on agent_id: empty = show all; non-empty = only apps
   * powered by one of these agents. Resolved against the live agents slice
   * at selection time so the filter UI can show agent names without
   * duplicating data here.
   */
  includedAgents: string[];

  archFilter: AgentAppArchFilter;
  visibilityFilter: AgentAppVisibilityFilter;

  /** Current page for list items (after the card section). */
  listPage: number;
}

export const DEFAULT_AGENT_APP_CONSUMER_STATE: AgentAppConsumerState = {
  tab: "mine",
  sortBy: "updated-desc",
  searchTerm: "",
  includedCats: [],
  includedTags: [],
  includedAgents: [],
  archFilter: "active",
  visibilityFilter: "all",
  listPage: 1,
};

export interface AgentAppConsumersState {
  consumers: Record<string, AgentAppConsumerState>;
}

const initialState: AgentAppConsumersState = {
  consumers: {},
};

// ── Slice ──────────────────────────────────────────────────────────────────────

const agentAppConsumersSlice = createSlice({
  name: "agentAppConsumers",
  initialState,

  reducers: {
    registerAgentAppConsumer: (state, action: PayloadAction<string>) => {
      const id = action.payload;
      if (!state.consumers[id]) {
        state.consumers[id] = { ...DEFAULT_AGENT_APP_CONSUMER_STATE };
      }
    },

    unregisterAgentAppConsumer: (state, action: PayloadAction<string>) => {
      delete state.consumers[action.payload];
    },

    setAgentAppConsumerFilter: (
      state,
      action: PayloadAction<{
        consumerId: string;
        patch: Partial<Omit<AgentAppConsumerState, "listPage">>;
      }>,
    ) => {
      const { consumerId, patch } = action.payload;
      if (!state.consumers[consumerId]) {
        state.consumers[consumerId] = { ...DEFAULT_AGENT_APP_CONSUMER_STATE };
      }
      Object.assign(state.consumers[consumerId], patch);
      state.consumers[consumerId].listPage = 1;
    },

    setAgentAppConsumerPage: (
      state,
      action: PayloadAction<{ consumerId: string; page: number }>,
    ) => {
      const { consumerId, page } = action.payload;
      if (!state.consumers[consumerId]) return;
      state.consumers[consumerId].listPage = page;
    },

    resetAgentAppConsumerFilters: (state, action: PayloadAction<string>) => {
      if (state.consumers[action.payload]) {
        state.consumers[action.payload] = {
          ...DEFAULT_AGENT_APP_CONSUMER_STATE,
        };
      }
    },
  },
});

// ── Plain selectors ───────────────────────────────────────────────────────────

type WithAgentAppConsumers = { agentAppConsumers: AgentAppConsumersState };

export const selectAgentAppConsumer = (
  state: WithAgentAppConsumers,
  consumerId: string,
): AgentAppConsumerState =>
  state.agentAppConsumers?.consumers[consumerId] ??
  DEFAULT_AGENT_APP_CONSUMER_STATE;

// ── Exports ────────────────────────────────────────────────────────────────────

export const {
  registerAgentAppConsumer,
  unregisterAgentAppConsumer,
  setAgentAppConsumerFilter,
  setAgentAppConsumerPage,
  resetAgentAppConsumerFilters,
} = agentAppConsumersSlice.actions;

export default agentAppConsumersSlice.reducer;
