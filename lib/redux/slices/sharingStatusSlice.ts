/**
 * sharingStatus — each record's visibility (published to the web, shown to),
 * read ONCE per record per tab and kept, keyed `${resourceType}:${id}`.
 *
 * `useSharingStatus` (every ShareButton: a board tile, a list card, a record
 * page) used to re-read the record's row on every mount — so a board tile that
 * woke from sleep, or was removed and undone, re-read its record each time
 * (remount-safety harness). The answer is the record's, not the button's: it
 * lives here, and a mount reads it from the store. `refresh` (after a share
 * change) re-reads it on purpose.
 */

import { createSelector, createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { ResourceVisibility } from "@/utils/permissions/service";

export interface SharingStatusEntry {
  visibility: ResourceVisibility | null;
  loading: boolean;
  error: string | null;
}

interface SharingStatusState {
  byKey: Record<string, SharingStatusEntry>;
}

const initialState: SharingStatusState = { byKey: {} };

const sharingStatusSlice = createSlice({
  name: "sharingStatus",
  initialState,
  reducers: {
    sharingStatusRequested(state, action: PayloadAction<{ key: string }>) {
      const entry = state.byKey[action.payload.key];
      if (entry) {
        entry.loading = true;
        entry.error = null;
      } else {
        state.byKey[action.payload.key] = { visibility: null, loading: true, error: null };
      }
    },
    sharingStatusLoaded(state, action: PayloadAction<{ key: string; visibility: ResourceVisibility }>) {
      state.byKey[action.payload.key] = { visibility: action.payload.visibility, loading: false, error: null };
    },
    sharingStatusFailed(state, action: PayloadAction<{ key: string; error: string }>) {
      const entry = state.byKey[action.payload.key];
      if (entry) {
        entry.loading = false;
        entry.error = action.payload.error;
      } else {
        state.byKey[action.payload.key] = { visibility: null, loading: false, error: action.payload.error };
      }
    },
  },
});

export const { sharingStatusRequested, sharingStatusLoaded, sharingStatusFailed } = sharingStatusSlice.actions;
export default sharingStatusSlice.reducer;

type WithSharingStatus = { sharingStatus?: SharingStatusState };

export function sharingStatusKey(resourceType: string, resourceId: string): string {
  return `${resourceType}:${resourceId}`;
}

export const selectSharingStatus = createSelector(
  [(state: WithSharingStatus) => state.sharingStatus?.byKey, (_state: WithSharingStatus, key: string) => key],
  (byKey, key): SharingStatusEntry | undefined => byKey?.[key],
);
