// features/agents/redux/agent-consumers/slice.ts
//
// Per-consumer filter, sort, and pagination state for agent list UIs.
//
// Identical pattern to promptConsumersSlice. Each distinct agent list UI
// (the main agents page, a chat picker, a shortcut builder, etc.) registers
// under a unique consumerId and gets completely isolated state.
//
// Usage pattern:
//   1. On mount:  dispatch(registerAgentConsumer("agents-main"))
//   2. To filter: dispatch(setAgentConsumerFilter({ consumerId: "agents-main", patch: { searchTerm: "gpt" } }))
//   3. To select: use makeSelectFilteredAgents("agents-main") from agentSelectors.ts

import { createSlice, PayloadAction } from "@reduxjs/toolkit";

// ── Types ──────────────────────────────────────────────────────────────────────

export type AgentSortOption =
  | "updated-desc"
  | "created-desc"
  | "name-asc"
  | "name-desc"
  | "category-asc";

/** Which ownership tab is active in the agent list. */
export type AgentTab = "mine" | "shared" | "all" | "system";

/** Favorite filter. */
export type AgentFavFilter = "all" | "yes" | "no";

/** Archive filter. */
export type AgentArchFilter = "active" | "archived" | "both";

/**
 * Access level filter.
 * 'any'    = no restriction (default).
 * 'owned'  = only agents the user owns (isOwner = true).
 * 'shared' = only agents shared with the user (isOwner = false).
 * 'editable' = owner + admin + editor.
 */
export type AgentAccessFilter = "any" | "owned" | "shared" | "editable";

/** Sentinel meaning "include uncategorized / untagged" items. */
export const AGENT_NONE_SENTINEL = "__none__";

export interface AgentConsumerState {
  tab: AgentTab;
  sortBy: AgentSortOption;
  searchTerm: string;

  /** INCLUSION model: empty = show all; non-empty = only matching. */
  includedCats: string[];

  /** INCLUSION model: empty = show all; non-empty = only matching. */
  includedTags: string[];

  favFilter: AgentFavFilter;
  archFilter: AgentArchFilter;
  accessFilter: AgentAccessFilter;
  favoritesFirst: boolean;

  /** Current page for owned-agent list items (after the card section). */
  listPage: number;

  /** Current page for shared-agent list items. */
  sharedPage: number;
}

export const DEFAULT_AGENT_CONSUMER_STATE: AgentConsumerState = {
  tab: "mine",
  sortBy: "updated-desc",
  searchTerm: "",
  includedCats: [],
  includedTags: [],
  favFilter: "all",
  archFilter: "active",
  accessFilter: "any",
  favoritesFirst: true,
  listPage: 1,
  sharedPage: 1,
};

export interface AgentConsumersState {
  consumers: Record<string, AgentConsumerState>;
}

const initialState: AgentConsumersState = {
  consumers: {},
};

// ── Slice ──────────────────────────────────────────────────────────────────────

const agentConsumersSlice = createSlice({
  name: "agentConsumers",
  initialState,

  reducers: {
    /**
     * Register a consumer with its default state.
     * Idempotent — safe to call multiple times on mount.
     * Will NOT reset state if the consumer is already registered.
     */
    registerAgentConsumer: (
      state,
      action: PayloadAction<
        | string
        | {
            consumerId: string;
            initial?: Partial<
              Omit<AgentConsumerState, "listPage" | "sharedPage">
            >;
          }
      >,
    ) => {
      const { consumerId, initial } =
        typeof action.payload === "string"
          ? { consumerId: action.payload, initial: undefined }
          : action.payload;
      if (!state.consumers[consumerId]) {
        state.consumers[consumerId] = {
          ...DEFAULT_AGENT_CONSUMER_STATE,
          ...initial,
        };
      }
    },

    /**
     * Unregister a consumer and free its state.
     * Call on unmount for ephemeral consumers (modals, drawers).
     * Persistent page consumers (e.g. "agents-main") can skip.
     */
    unregisterAgentConsumer: (state, action: PayloadAction<string>) => {
      delete state.consumers[action.payload];
    },

    /**
     * Patch any subset of a consumer's filter/sort state.
     * Automatically resets listPage and sharedPage to 1 whenever called
     * so the user never gets stuck on a page with no results.
     *
     * @example
     * dispatch(setAgentConsumerFilter({
     *   consumerId: "agents-main",
     *   patch: { searchTerm: "gpt", sortBy: "name-asc" },
     * }))
     */
    setAgentConsumerFilter: (
      state,
      action: PayloadAction<{
        consumerId: string;
        patch: Partial<Omit<AgentConsumerState, "listPage" | "sharedPage">>;
      }>,
    ) => {
      const { consumerId, patch } = action.payload;
      if (!state.consumers[consumerId]) {
        state.consumers[consumerId] = { ...DEFAULT_AGENT_CONSUMER_STATE };
      }
      Object.assign(state.consumers[consumerId], patch);
      state.consumers[consumerId].listPage = 1;
      state.consumers[consumerId].sharedPage = 1;
    },

    /**
     * Advance the pagination page for a consumer.
     * Consumers use infinite-scroll / "Load more" — no back-paging needed.
     */
    setAgentConsumerPage: (
      state,
      action: PayloadAction<{
        consumerId: string;
        which: "list" | "shared";
        page: number;
      }>,
    ) => {
      const { consumerId, which, page } = action.payload;
      if (!state.consumers[consumerId]) return;
      if (which === "list") state.consumers[consumerId].listPage = page;
      if (which === "shared") state.consumers[consumerId].sharedPage = page;
    },

    /**
     * Reset all filter state for a consumer back to defaults.
     * Keeps the consumer registered.
     */
    resetAgentConsumerFilters: (state, action: PayloadAction<string>) => {
      if (state.consumers[action.payload]) {
        state.consumers[action.payload] = { ...DEFAULT_AGENT_CONSUMER_STATE };
      }
    },
  },
});

// ── Selectors ──────────────────────────────────────────────────────────────────

type WithAgentConsumers = { agentConsumers: AgentConsumersState };

export const selectAgentConsumer = (
  state: WithAgentConsumers,
  consumerId: string,
): AgentConsumerState =>
  state.agentConsumers?.consumers[consumerId] ?? DEFAULT_AGENT_CONSUMER_STATE;

export const selectAllAgentConsumers = (state: WithAgentConsumers) =>
  state.agentConsumers?.consumers ?? {};

// ── Exports ────────────────────────────────────────────────────────────────────

export const {
  registerAgentConsumer,
  unregisterAgentConsumer,
  setAgentConsumerFilter,
  setAgentConsumerPage,
  resetAgentConsumerFilters,
} = agentConsumersSlice.actions;

export default agentConsumersSlice.reducer;
