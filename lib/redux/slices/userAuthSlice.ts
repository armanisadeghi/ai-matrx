// File: lib/redux/slices/userAuthSlice.ts
//
// Phase 4 split: auth-domain fields. Volatile by design — accessToken and
// session metadata are server-issued each session, must NOT persist to
// localStorage / IDB. Replaces the auth half of the legacy `userSlice.ts`
// (deleted in same PR per Constitution N2 — no coexistence).
//
// Field allocation rationale (decisions.md D1):
// - id, email, phone, emailConfirmedAt, lastSignInAt — auth-domain identity
// - appMetadata, identities — Supabase OAuth provider context
// - isAdmin — authz, derived from auth context
// - accessToken, tokenExpiresAt — auth secret + lifecycle, MUST NOT persist
// - authReady — boot-time flag, transient by nature
//
// Profile data (userMetadata, fingerprintId, shellDataLoaded) lives in
// `userProfileSlice.ts` and is persisted via the `boot-critical` preset.

import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { IdentityData, AppMetadata } from "@/utils/userDataMapper";
import type { AdminLevel } from "@/utils/supabase/userSessionData";

export interface UserAuthState {
  id: string | null;
  email: string | null;
  phone: string | null;
  emailConfirmedAt: string | null;
  lastSignInAt: string | null;
  appMetadata: AppMetadata;
  identities: IdentityData[];
  isAdmin: boolean;
  /** Admin tier — null for non-admins. Highest-bar gates check === 'super_admin'. */
  adminLevel: AdminLevel | null;
  accessToken: string | null;
  /** Unix timestamp (seconds) when the access token expires. */
  tokenExpiresAt: number | null;
  /** True once the boot path has resolved either an auth user or fingerprint. */
  authReady: boolean;
}

const initialState: UserAuthState = {
  id: null,
  email: null,
  phone: null,
  emailConfirmedAt: null,
  lastSignInAt: null,
  appMetadata: {
    provider: null,
    providers: [],
  },
  identities: [],
  isAdmin: false,
  adminLevel: null,
  accessToken: null,
  tokenExpiresAt: null,
  authReady: false,
};

const userAuthSlice = createSlice({
  name: "userAuth",
  initialState,
  reducers: {
    /**
     * Merge auth fields into state. Mirrors the legacy `setUser({...})` for
     * the auth-domain subset; marks `authReady=true` on every set (the
     * legacy slice did this, and downstream code depends on it).
     */
    setUserAuth: (state, action: PayloadAction<Partial<UserAuthState>>) => {
      return { ...state, ...action.payload, authReady: true };
    },
    setAccessToken: (state, action: PayloadAction<string | null>) => {
      state.accessToken = action.payload;
    },
    setTokenExpiry: (state, action: PayloadAction<number | null>) => {
      state.tokenExpiresAt = action.payload;
    },
    setAuthReady: (state, action: PayloadAction<boolean>) => {
      state.authReady = action.payload;
    },
    /** Resets to initial — clears accessToken (security invariant). */
    clearUserAuth: () => initialState,
  },
});

export const {
  setUserAuth,
  setAccessToken,
  setTokenExpiry,
  setAuthReady,
  clearUserAuth,
} = userAuthSlice.actions;

export default userAuthSlice.reducer;
