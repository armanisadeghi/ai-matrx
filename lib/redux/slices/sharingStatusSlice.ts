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
 *
 * `authorityByKey` is the same rule for "may I decide who else sees this?"
 * (`useIsOwner` → `public.may_manage_sharing`): every share control of a record
 * (a note tile's Share menu, its Share dialog) asks it once per record per tab,
 * and a woken or remounted view reads the answer from here.
 */

import { createSelector, createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { ResourceVisibility } from "@/utils/permissions/service";

export interface SharingStatusEntry {
  visibility: ResourceVisibility | null;
  loading: boolean;
  error: string | null;
}

/** "May I decide who else sees this?" for one record — see `useIsOwner`. */
export interface SharingAuthorityEntry {
  isOwner: boolean;
  loading: boolean;
  /** Could not be determined (never a denial). */
  error: string | null;
}

interface SharingStatusState {
  byKey: Record<string, SharingStatusEntry>;
  authorityByKey: Record<string, SharingAuthorityEntry>;
}

const initialState: SharingStatusState = { byKey: {}, authorityByKey: {} };

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
    sharingAuthorityRequested(state, action: PayloadAction<{ key: string }>) {
      const entry = state.authorityByKey[action.payload.key];
      if (entry) entry.loading = true;
      else state.authorityByKey[action.payload.key] = { isOwner: false, loading: true, error: null };
    },
    sharingAuthorityResolved(state, action: PayloadAction<{ key: string; isOwner: boolean; error: string | null }>) {
      const { key, isOwner, error } = action.payload;
      state.authorityByKey[key] = { isOwner, loading: false, error };
    },
  },
});

export const {
  sharingStatusRequested,
  sharingStatusLoaded,
  sharingStatusFailed,
  sharingAuthorityRequested,
  sharingAuthorityResolved,
} = sharingStatusSlice.actions;
export default sharingStatusSlice.reducer;

type WithSharingStatus = { sharingStatus?: SharingStatusState };

export function sharingStatusKey(resourceType: string, resourceId: string): string {
  return `${resourceType}:${resourceId}`;
}

export const selectSharingStatus = createSelector(
  [(state: WithSharingStatus) => state.sharingStatus?.byKey, (_state: WithSharingStatus, key: string) => key],
  (byKey, key): SharingStatusEntry | undefined => byKey?.[key],
);

export const selectSharingAuthority = createSelector(
  [(state: WithSharingStatus) => state.sharingStatus?.authorityByKey, (_state: WithSharingStatus, key: string) => key],
  (byKey, key): SharingAuthorityEntry | undefined => byKey?.[key],
);
