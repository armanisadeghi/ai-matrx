// File: lib/redux/thunks/userDataThunk.ts
//
// Phase 4: ergonomic replacement for the legacy `setUser({...})` action,
// which took `Partial<UserState>` spanning both the auth and profile
// domains. After the slice split, callers fan out to two new slices —
// this thunk keeps the call-site signature unchanged.
//
// Replaces: `userSlice.setUser` (deleted in same PR per Constitution N2).
// Consumers: `features/shell/components/DeferredShellData.tsx`,
// `hooks/usePublicAuthSync.ts`, `hooks/useApiAuth.ts`.

import { setUserAuth, type UserAuthState } from "@/lib/redux/slices/userAuthSlice";
import {
  setUserProfile,
  type UserProfileState,
} from "@/lib/redux/slices/userProfileSlice";
import type { UserData } from "@/utils/userDataMapper";
import type { Dispatch } from "@reduxjs/toolkit";

const AUTH_KEYS = [
  "id",
  "email",
  "phone",
  "emailConfirmedAt",
  "lastSignInAt",
  "appMetadata",
  "identities",
  "isAdmin",
  "adminLevel",
  "accessToken",
  "tokenExpiresAt",
] as const satisfies readonly (keyof UserAuthState)[];

const PROFILE_KEYS = [
  "userMetadata",
  "fingerprintId",
  "shellDataLoaded",
] as const satisfies readonly (keyof UserProfileState)[];

type LegacyUserPayload = Partial<UserData> & Partial<UserProfileState>;

/**
 * Fan out a legacy-shaped `Partial<UserData>` payload to the auth + profile
 * slices. Empty payloads are no-ops (no dispatch). Mirrors the legacy
 * `setUser({...})` ergonomics — callers pass a single object spanning both
 * domains; the thunk routes each field to the right slice.
 *
 * Note: `setUserAuth` marks `authReady=true` on every dispatch (reducer
 * invariant). If the payload contains no auth fields, that flip does NOT
 * happen — callers needing the legacy "any setUser implies auth-ready"
 * behavior should ensure at least one auth field is in the payload, or
 * dispatch `setAuthReady(true)` separately.
 */
export const setUserData =
  (payload: LegacyUserPayload) => (dispatch: Dispatch) => {
    const authPart: Partial<UserAuthState> = {};
    const profilePart: Partial<UserProfileState> = {};

    for (const key of AUTH_KEYS) {
      if (key in payload) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (authPart as Record<string, unknown>)[key] = (payload as any)[key];
      }
    }
    for (const key of PROFILE_KEYS) {
      if (key in payload) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (profilePart as Record<string, unknown>)[key] = (payload as any)[key];
      }
    }

    if (Object.keys(authPart).length > 0) {
      dispatch(setUserAuth(authPart));
    }
    if (Object.keys(profilePart).length > 0) {
      dispatch(setUserProfile(profilePart));
    }
  };
