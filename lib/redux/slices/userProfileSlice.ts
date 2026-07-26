// File: lib/redux/slices/userProfileSlice.ts
//
// Phase 4 split: profile-domain fields. Persistable via the boot-critical
// preset — `userMetadata` (avatar URL, display names) drives every header
// render, so first-paint correctness matters. Replaces the profile half of
// the legacy `userSlice.ts` (deleted in same PR per Constitution N2).
//
// Field allocation rationale (decisions.md D1):
// - userMetadata — display data, persists via partialize for first-paint
// - fingerprintId — stable per-device id for guest identity; persists
// - shellDataLoaded — boot-time loading flag; transient, NOT persisted
//
// Auth-domain fields (id, email, accessToken, isAdmin, etc.) live in
// `userAuthSlice.ts` and are intentionally volatile.
// Deep imports (not the @/lib/sync barrel) match the pattern used by
// themeSlice.ts + userPreferencesSlice.ts — the barrel re-exports
// `syncPolicies` from `./registry`, which imports this policy back.
// Routing through the barrel creates a runtime initialization cycle
// under Turbopack.

import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import { definePolicy } from "@/lib/sync/policies/define";
import {
  REHYDRATE_ACTION_TYPE,
  type RehydrateAction,
} from "@/lib/sync/engine/rehydrate";
import type { UserMetadata } from "@/utils/userDataMapper";

export interface UserProfileState {
  userMetadata: UserMetadata;
  fingerprintId: string | null;
  /** Tracks if shell data (user + preferences) has fully loaded — gates
   * components that must not render stale defaults (e.g. AnnouncementProvider).
   * Transient — NOT persisted (excluded via partialize). */
  shellDataLoaded: boolean;
}

const initialState: UserProfileState = {
  userMetadata: {
    avatarUrl: null,
    fullName: null,
    name: null,
    preferredUsername: null,
    picture: null,
  },
  fingerprintId: null,
  shellDataLoaded: false,
};

const userProfileSlice = createSlice({
  name: "userProfile",
  initialState,
  reducers: {
    /**
     * Merge fields into userMetadata. Mirrors the legacy `setUser({...})`
     * for the profile-domain subset.
     */
    setUserMetadata: (state, action: PayloadAction<Partial<UserMetadata>>) => {
      state.userMetadata = { ...state.userMetadata, ...action.payload };
    },
    /**
     * Set the full UserProfile state (legacy `setUser` parity for callers
     * that pass a complete payload). Used by `setUserData` thunk fan-out.
     */
    setUserProfile: (state, action: PayloadAction<Partial<UserProfileState>>) => {
      if (action.payload.userMetadata) {
        state.userMetadata = {
          ...state.userMetadata,
          ...action.payload.userMetadata,
        };
      }
      if (action.payload.fingerprintId !== undefined) {
        state.fingerprintId = action.payload.fingerprintId;
      }
      if (action.payload.shellDataLoaded !== undefined) {
        state.shellDataLoaded = action.payload.shellDataLoaded;
      }
    },
    setFingerprintId: (state, action: PayloadAction<string>) => {
      state.fingerprintId = action.payload;
    },
    setShellDataLoaded: (state, action: PayloadAction<boolean>) => {
      state.shellDataLoaded = action.payload;
    },
    clearUserProfile: () => initialState,
  },
  extraReducers: (builder) => {
    // Sync engine rehydrate — `userProfilePolicy` writes the partialized
    // body to localStorage; on boot the engine reads it back and dispatches
    // REHYDRATE so reducers stay pure (no side-effects in initialState).
    builder.addCase(REHYDRATE_ACTION_TYPE, (state, action: RehydrateAction) => {
      if (action.payload.sliceName !== "userProfile") return;
      const loaded = action.payload.state as
        | Partial<UserProfileState>
        | undefined;
      if (!loaded) return;
      if (loaded.userMetadata) {
        state.userMetadata = { ...state.userMetadata, ...loaded.userMetadata };
      }
      // fingerprintId is intentionally NOT in `partialize` — it's identity-
      // domain, set by the auth flow on each boot. shellDataLoaded is also
      // excluded (transient). So we don't read either from REHYDRATE.
    });
  },
});

export const {
  setUserMetadata,
  setUserProfile,
  setFingerprintId,
  setShellDataLoaded,
  clearUserProfile,
} = userProfileSlice.actions;

export default userProfileSlice.reducer;

// ---- Sync engine policy --------------------------------------------------
//
// `userProfilePolicy` makes the slice a first-class citizen of the unified
// sync engine. It:
//   - persists `userMetadata` to localStorage (boot-critical preset → small,
//     hot data, write-through on every action)
//   - broadcasts mutations across tabs (<20ms)
//   - hydrates pre-paint via REHYDRATE so the user avatar/name renders
//     correctly on the very first frame (no flicker on hard-refresh)
//
// `partialize: ["userMetadata"]` — fingerprintId is identity-domain (set by
// the auth boot path each session), shellDataLoaded is transient. Persisting
// either could cause stale-data bugs (e.g. AnnouncementProvider rendering
// before this turn's actual shell-data fetch completes).

export const userProfilePolicy = definePolicy<UserProfileState>({
  sliceName: "userProfile",
  preset: "boot-critical",
  version: 1, // Bump destroys client caches; Phase 6 adds migration hooks.
  broadcast: {
    actions: [
      "userProfile/setUserMetadata",
      "userProfile/setUserProfile",
      "userProfile/clearUserProfile",
    ],
  },
  storageKey: "matrx:userProfile",
  partialize: ["userMetadata"],
  serialize: (state) => ({ userMetadata: state.userMetadata }),
  deserialize: (raw) => {
    if (
      raw &&
      typeof raw === "object" &&
      "userMetadata" in raw &&
      typeof (raw as { userMetadata?: unknown }).userMetadata === "object" &&
      (raw as { userMetadata?: unknown }).userMetadata !== null
    ) {
      const um = (raw as { userMetadata: Partial<UserMetadata> }).userMetadata;
      return {
        userMetadata: {
          avatarUrl: typeof um.avatarUrl === "string" ? um.avatarUrl : null,
          fullName: typeof um.fullName === "string" ? um.fullName : null,
          name: typeof um.name === "string" ? um.name : null,
          preferredUsername:
            typeof um.preferredUsername === "string"
              ? um.preferredUsername
              : null,
          picture: typeof um.picture === "string" ? um.picture : null,
        },
      };
    }
    // Fallback to defaults — never throw on malformed persisted data.
    return {
      userMetadata: {
        avatarUrl: null,
        fullName: null,
        name: null,
        preferredUsername: null,
        picture: null,
      },
    };
  },
});
