/**
 * Assists slice — my live pending assists (the chips), platform-wide.
 *
 * One fetch fills it (mine-scope, pending, unexpired); deciding a chip
 * removes it locally in the same dispatch as the DB write. Producers that
 * emit client-side push the fresh assist in so the dock updates without a
 * refetch.
 */

import {
  createAsyncThunk,
  createSelector,
  createSlice,
  type PayloadAction,
} from "@reduxjs/toolkit";
import type { RootState } from "@/lib/redux/store";
import { listMyPendingAssists } from "../service";
import type { Assist } from "../types";

interface AssistsState {
  pending: Assist[];
  loaded: boolean;
  loading: boolean;
  error: string | null;
}

const initialState: AssistsState = {
  pending: [],
  loaded: false,
  loading: false,
  error: null,
};

export const fetchMyAssists = createAsyncThunk<
  Assist[],
  { userId: string },
  { state: RootState }
>("assists/fetchMine", async ({ userId }) => listMyPendingAssists(userId));

const assistsSlice = createSlice({
  name: "assists",
  initialState,
  reducers: {
    /** A chip was decided (accepted/dismissed) — drop it from the stack. */
    assistDecided(state, action: PayloadAction<string>) {
      state.pending = state.pending.filter((a) => a.id !== action.payload);
    },
    /** A whole producer/check was silenced — remove every matching chip. */
    assistsSourceSuppressed(state, action: PayloadAction<string>) {
      state.pending = state.pending.filter(
        (assist) => assist.sourceKey !== action.payload,
      );
    },
    /** A client-side producer emitted (or refreshed) an assist. */
    assistEmitted(state, action: PayloadAction<Assist>) {
      const idx = state.pending.findIndex((a) => a.id === action.payload.id);
      if (idx >= 0) {
        state.pending[idx] = action.payload;
      } else {
        state.pending.unshift(action.payload);
      }
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchMyAssists.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchMyAssists.fulfilled, (state, action) => {
        state.loading = false;
        state.loaded = true;
        state.pending = action.payload;
      })
      .addCase(fetchMyAssists.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message ?? "Failed to load assists";
      });
  },
});

export const { assistDecided, assistEmitted, assistsSourceSuppressed } =
  assistsSlice.actions;

const selectAssistsState = (state: RootState) => state.assists;

export const selectPendingAssists = createSelector(
  [selectAssistsState],
  (s) => s.pending,
);
export const selectAssistsLoaded = createSelector(
  [selectAssistsState],
  (s) => s.loaded,
);
export const selectPendingAssistCount = createSelector(
  [selectPendingAssists],
  (pending) => pending.length,
);
/** Pending assists addressed to one surface (`<client>/<surface>`). */
export const selectAssistsForSurface = createSelector(
  [
    selectPendingAssists,
    (_state: RootState, surfaceName: string) => surfaceName,
  ],
  (pending, surfaceName) =>
    pending.filter((a) => a.surfaceName === surfaceName),
);

export default assistsSlice.reducer;
