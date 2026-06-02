// lib/redux/slices/kgSuggestionsSlice.ts
//
// The FIRST Knowledge-Graph Redux slice — canonical home for KG → scope-item
// suggestion state on the FE. It is NOT a parallel of any existing slice
// (suggestions are a distinct, long-lived, user-scoped resource). State
// approach justification lives in features/kg-suggestions/FEATURE.md.
//
// Shape: a normalized `byId` map of suggestion rows + per-filter-key list
// entries (`{ ids, total, status, error }`). Multiple surfaces address the
// same data through different filters (a note chip, the per-slot panel, the
// global drawer); they all derive a stable `kgFilterKey` and share the
// normalized rows underneath, so an accept on one surface clears the count on
// every other surface that listed that row.
//
// Writes are small + individual (per CLAUDE.md). Async lives in the thunks
// dispatched by useKgSuggestions; this slice is pure reducers + selectors.

import { createSelector, createSlice, PayloadAction } from "@reduxjs/toolkit";
import type { RootState } from "@/lib/redux/store";
import type { KgSuggestionRow } from "@/features/kg-suggestions/types";

export type KgListStatus = "idle" | "loading" | "success" | "error";
export type KgRowMutation = "idle" | "accepting" | "rejecting" | "deferring";

interface KgListEntry {
  /** Suggestion ids in server order for this filter key. */
  ids: string[];
  total: number;
  status: KgListStatus;
  error: string | null;
}

export interface KgSuggestionsState {
  byId: Record<string, KgSuggestionRow>;
  /** Keyed by `kgFilterKey(filter)`. */
  lists: Record<string, KgListEntry>;
  /** Per-row in-flight decision status (accept/reject/defer). */
  mutation: Record<string, KgRowMutation>;
}

const initialState: KgSuggestionsState = {
  byId: {},
  lists: {},
  mutation: {},
};

const EMPTY_ENTRY: KgListEntry = {
  ids: [],
  total: 0,
  status: "idle",
  error: null,
};

function ensureList(state: KgSuggestionsState, key: string): KgListEntry {
  if (!state.lists[key]) {
    state.lists[key] = { ids: [], total: 0, status: "idle", error: null };
  }
  return state.lists[key];
}

const kgSuggestionsSlice = createSlice({
  name: "kgSuggestions",
  initialState,
  reducers: {
    listPending(state, action: PayloadAction<{ key: string }>) {
      const entry = ensureList(state, action.payload.key);
      entry.status = "loading";
      entry.error = null;
    },
    listSuccess(
      state,
      action: PayloadAction<{
        key: string;
        rows: KgSuggestionRow[];
        total: number;
      }>,
    ) {
      const { key, rows, total } = action.payload;
      const entry = ensureList(state, key);
      entry.status = "success";
      entry.error = null;
      entry.total = total;
      entry.ids = rows.map((r) => r.id);
      for (const row of rows) state.byId[row.id] = row;
    },
    listError(state, action: PayloadAction<{ key: string; error: string }>) {
      const entry = ensureList(state, action.payload.key);
      entry.status = "error";
      entry.error = action.payload.error;
    },

    setRowMutation(
      state,
      action: PayloadAction<{ id: string; mutation: KgRowMutation }>,
    ) {
      const { id, mutation } = action.payload;
      if (mutation === "idle") delete state.mutation[id];
      else state.mutation[id] = mutation;
    },

    /** Upsert a single row (used after a decision returns the updated row). */
    upsertRow(state, action: PayloadAction<KgSuggestionRow>) {
      state.byId[action.payload.id] = action.payload;
    },

    /**
     * Remove a decided row from EVERY list that held it (so a chip count and
     * the drawer both drop in one update), and clear its mutation flag. The
     * row stays in `byId` (the decision response may still be rendered).
     */
    removeFromLists(state, action: PayloadAction<{ id: string }>) {
      const { id } = action.payload;
      for (const key of Object.keys(state.lists)) {
        const entry = state.lists[key];
        const idx = entry.ids.indexOf(id);
        if (idx !== -1) {
          entry.ids.splice(idx, 1);
          entry.total = Math.max(0, entry.total - 1);
        }
      }
      delete state.mutation[id];
    },

    /** Hard reset on logout / org switch. */
    resetKgSuggestions() {
      return initialState;
    },
  },
});

export const {
  listPending,
  listSuccess,
  listError,
  setRowMutation,
  upsertRow,
  removeFromLists,
  resetKgSuggestions,
} = kgSuggestionsSlice.actions;

export default kgSuggestionsSlice.reducer;

// ── Selectors (every property has its own memoized selector) ─────────────────

const selectKgRoot = (state: RootState): KgSuggestionsState => state.kgSuggestions;
const selectKgById = (state: RootState) => selectKgRoot(state).byId;
const selectKgLists = (state: RootState) => selectKgRoot(state).lists;
const selectKgMutationMap = (state: RootState) => selectKgRoot(state).mutation;

const selectListEntry = (state: RootState, key: string): KgListEntry =>
  selectKgLists(state)[key] ?? EMPTY_ENTRY;

/** Memoized rows for one filter key (resolved from the normalized map). */
export const makeSelectKgRowsForKey = () =>
  createSelector(
    [selectKgById, (state: RootState, key: string) => selectListEntry(state, key)],
    (byId, entry) =>
      entry.ids.map((id) => byId[id]).filter((r): r is KgSuggestionRow => Boolean(r)),
  );

export const selectKgCountForKey = (state: RootState, key: string): number =>
  selectListEntry(state, key).total;

export const selectKgListStatusForKey = (
  state: RootState,
  key: string,
): KgListStatus => selectListEntry(state, key).status;

export const selectKgListErrorForKey = (
  state: RootState,
  key: string,
): string | null => selectListEntry(state, key).error;

export const selectKgRowMutation = (
  state: RootState,
  id: string,
): KgRowMutation => selectKgMutationMap(state)[id] ?? "idle";

export const selectKgRowById = (
  state: RootState,
  id: string,
): KgSuggestionRow | undefined => selectKgById(state)[id];
