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

import {
  setUserAuth,
  type UserAuthState,
} from "@/lib/redux/slices/userAuthSlice";
import {
  setUserProfile,
  type UserProfileState,
} from "@/lib/redux/slices/userProfileSlice";
import type { UserData } from "@/utils/userDataMapper";
import type { Dispatch } from "@reduxjs/toolkit";

type LegacyUserPayload = Partial<UserData> & Partial<UserProfileState>;

/**
 * Per-field picks — a loop over `keyof` loses key↔value correlation under
 * strictFunctionTypes, so each field is named explicitly (no cast).
 */
function pickAuthFields(source: LegacyUserPayload): Partial<UserAuthState> {
  const out: Partial<UserAuthState> = {};
  if (source.id !== undefined) out.id = source.id;
  if (source.email !== undefined) out.email = source.email;
  if (source.phone !== undefined) out.phone = source.phone;
  if (source.emailConfirmedAt !== undefined) {
    out.emailConfirmedAt = source.emailConfirmedAt;
  }
  if (source.lastSignInAt !== undefined) out.lastSignInAt = source.lastSignInAt;
  if (source.appMetadata !== undefined) out.appMetadata = source.appMetadata;
  if (source.identities !== undefined) out.identities = source.identities;
  if (source.isAdmin !== undefined) out.isAdmin = source.isAdmin;
  if (source.adminLevel !== undefined) out.adminLevel = source.adminLevel;
  if (source.accessToken !== undefined) out.accessToken = source.accessToken;
  if (source.tokenExpiresAt !== undefined) {
    out.tokenExpiresAt = source.tokenExpiresAt;
  }
  return out;
}

function pickProfileFields(
  source: LegacyUserPayload,
): Partial<UserProfileState> {
  const out: Partial<UserProfileState> = {};
  if (source.userMetadata !== undefined) out.userMetadata = source.userMetadata;
  if (source.fingerprintId !== undefined) {
    out.fingerprintId = source.fingerprintId;
  }
  if (source.shellDataLoaded !== undefined) {
    out.shellDataLoaded = source.shellDataLoaded;
  }
  return out;
}

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
    const authPart = pickAuthFields(payload);
    const profilePart = pickProfileFields(payload);

    if (Object.keys(authPart).length > 0) {
      dispatch(setUserAuth(authPart));
    }
    if (Object.keys(profilePart).length > 0) {
      dispatch(setUserProfile(profilePart));
    }
  };
