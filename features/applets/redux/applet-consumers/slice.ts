// features/applets/redux/applet-consumers/slice.ts
//
// Per-consumer filter, sort, and pagination state for applet list UIs.
//
// Mirrors the agent-consumers / promptConsumers pattern exactly. Each distinct
// applet list UI (the main /applets page, an agent-detail "apps for this
// agent" view, an org/admin variant, a picker modal, etc.) registers under a
// unique consumerId and gets completely isolated state.
//
// Usage pattern:
//   1. On mount:  dispatch(registerAppletConsumer("apps-main"))
//   2. To filter: dispatch(setAppletConsumerFilter({ consumerId, patch: { searchTerm: "tutor" } }))
//   3. To select: use makeSelectFilteredApps("apps-main") from selectors.ts
//
// EXTENDING THE FILTER / SORT SET:
// Apps will need many more dimensions over time (success_rate, total_cost,
// last_run, user_feedback, etc). To add one:
//   1. Add the field to AppletConsumerState + DEFAULT_APPLET_CONSUMER_STATE.
//   2. Add a setter wrapper to useAppletConsumer.
//   3. Add a predicate in selectors.ts (the "Filter predicates" block).
//   4. Add a comparator entry in selectors.ts (the SORT_COMPARATORS map) if
//      it's a sort dimension.
// The shape is intentionally flat so no orchestration is needed — adding a
// dimension is mechanical, never structural.

import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

// ── Types ──────────────────────────────────────────────────────────────────────

export type AppletSortOption =
  | "updated-desc"
  | "created-desc"
  | "name-asc"
  | "name-desc"
  | "category-asc"
  | "executions-desc"
  | "last-run-desc";

/** Which ownership tab is active. */
export type AppletTab = "mine" | "shared" | "all";

/** Maps onto AppletRow.status. "active" = anything not archived/suspended. */
export type AppletArchFilter = "active" | "archived" | "both";

/** Published-to-the-web filter ("public" = published, "personal" = not
 *  published; the values are the persisted URL/state keys). Independent of status. */
export type AppletVisibilityFilter = "all" | "public" | "personal";

/** Sentinel meaning "include uncategorized / untagged" items. */
export const APPLET_NONE_SENTINEL = "__none__";

export interface AppletConsumerState {
  tab: AppletTab;
  sortBy: AppletSortOption;
  searchTerm: string;

  /** INCLUSION model: empty = show all; non-empty = only matching. */
  includedCats: string[];

  /** INCLUSION model: empty = show all; non-empty = only matching. */
  includedTags: string[];


  archFilter: AppletArchFilter;
  visibilityFilter: AppletVisibilityFilter;

  /** Current page for list items (after the card section). */
  listPage: number;
}

export const DEFAULT_APPLET_CONSUMER_STATE: AppletConsumerState = {
  tab: "mine",
  sortBy: "updated-desc",
  searchTerm: "",
  includedCats: [],
  includedTags: [],
  archFilter: "active",
  visibilityFilter: "all",
  listPage: 1,
};

export interface AppletConsumersState {
  consumers: Record<string, AppletConsumerState>;
}

const initialState: AppletConsumersState = {
  consumers: {},
};

// ── Slice ──────────────────────────────────────────────────────────────────────

const appletConsumersSlice = createSlice({
  name: "appletConsumers",
  initialState,

  reducers: {
    registerAppletConsumer: (state, action: PayloadAction<string>) => {
      const id = action.payload;
      if (!state.consumers[id]) {
        state.consumers[id] = { ...DEFAULT_APPLET_CONSUMER_STATE };
      }
    },

    unregisterAppletConsumer: (state, action: PayloadAction<string>) => {
      delete state.consumers[action.payload];
    },

    setAppletConsumerFilter: (
      state,
      action: PayloadAction<{
        consumerId: string;
        patch: Partial<Omit<AppletConsumerState, "listPage">>;
      }>,
    ) => {
      const { consumerId, patch } = action.payload;
      if (!state.consumers[consumerId]) {
        state.consumers[consumerId] = { ...DEFAULT_APPLET_CONSUMER_STATE };
      }
      Object.assign(state.consumers[consumerId], patch);
      state.consumers[consumerId].listPage = 1;
    },

    setAppletConsumerPage: (
      state,
      action: PayloadAction<{ consumerId: string; page: number }>,
    ) => {
      const { consumerId, page } = action.payload;
      if (!state.consumers[consumerId]) return;
      state.consumers[consumerId].listPage = page;
    },

    resetAppletConsumerFilters: (state, action: PayloadAction<string>) => {
      if (state.consumers[action.payload]) {
        state.consumers[action.payload] = {
          ...DEFAULT_APPLET_CONSUMER_STATE,
        };
      }
    },
  },
});

// ── Plain selectors ───────────────────────────────────────────────────────────

type WithAppletConsumers = { appletConsumers: AppletConsumersState };

export const selectAppletConsumer = (
  state: WithAppletConsumers,
  consumerId: string,
): AppletConsumerState =>
  state.appletConsumers?.consumers[consumerId] ??
  DEFAULT_APPLET_CONSUMER_STATE;

// ── Exports ────────────────────────────────────────────────────────────────────

export const {
  registerAppletConsumer,
  unregisterAppletConsumer,
  setAppletConsumerFilter,
  setAppletConsumerPage,
  resetAppletConsumerFilters,
} = appletConsumersSlice.actions;

export default appletConsumersSlice.reducer;
