// File: lib/redux/selectors/userSelectors.ts
//
// Phase 4: canonical home for user-related selectors. Consolidates the
// previous split between `lib/redux/slices/userSlice.ts` (deleted in same
// PR) and this file. Names preserved across both legacy locations so
// consumers continue to work.
//
// Reads from the post-split `state.userAuth` and `state.userProfile`
// slices. The composite `selectUser` reconstructs the legacy `UserState`
// shape via `createSelector` for whole-slice consumers — memoized, so
// referential identity is stable across unchanged inputs.

import type { RootState } from "@/lib/redux/store";
import { createSelector } from "reselect";
import type { UserAuthState } from "@/lib/redux/slices/userAuthSlice";
import type { UserProfileState } from "@/lib/redux/slices/userProfileSlice";
import type { AdminLevel } from "@/utils/supabase/userSessionData";
import {
  adminTierHoldsFeature,
  type AdminFeatureOnUserPageId,
} from "@/utils/auth/adminFeaturesOnUserPages";

// ── Slice selectors ──────────────────────────────────────────────────────

const selectUserAuth = (state: RootState): UserAuthState => state.userAuth;
const selectUserProfile = (state: RootState): UserProfileState =>
  state.userProfile;

// ── Composite (legacy shape) ─────────────────────────────────────────────

/**
 * Reconstructed legacy `UserState` shape. Memoized — two calls with
 * unchanged `state.userAuth` + `state.userProfile` return the same object
 * reference, so `useAppSelector(selectUser)` doesn't trigger spurious
 * re-renders.
 */
export const selectUser = createSelector(
  [selectUserAuth, selectUserProfile],
  (auth, profile) => ({
    ...auth,
    userMetadata: profile.userMetadata,
    fingerprintId: profile.fingerprintId,
  }),
);

// ── Auth-domain primitives ───────────────────────────────────────────────

export const selectUserId = (state: RootState): string | null =>
  state.userAuth.id;
export const selectUserCreatedAt = (state: RootState): string | null =>
  state.userAuth.createdAt;
export const selectIsAnonymous = (state: RootState): boolean =>
  state.userAuth.isAnonymous;
export const selectUserEmail = (state: RootState): string | null =>
  state.userAuth.email;
export const selectUserPhone = (state: RootState): string | null =>
  state.userAuth.phone;
export const selectUserEmailConfirmedAt = (state: RootState): string | null =>
  state.userAuth.emailConfirmedAt;
export const selectUserLastSignInAt = (state: RootState): string | null =>
  state.userAuth.lastSignInAt;

/*
 * ADMIN IDENTITY vs ADMIN POWER (Arman, 2026-09-25): "Admin privileges cannot
 * ever extend beyond the admin sections of the system. A persona with admin
 * privileges should see nothing more than anyone else in any area of the
 * normal user pages."
 *
 * The three default gates below — `selectIsAdmin`, `selectAdminLevel`,
 * `selectIsSuperAdmin` — are ADMIN POWER: true only while the page is in the
 * admin section (`state.userAuth.adminLaneOpen`, see
 * utils/supabase/adminLane.ts). On every user page an admin reads exactly like
 * everyone else, and so does the database (its admin arms need the same lane).
 *
 * The `...Person` selectors are ADMIN IDENTITY — "is this person an admin at
 * all". They exist for ONE job: offering the way INTO the admin section
 * (the admin-portal link, the admin indicator, a sign-out warning). Never gate
 * data, a control, or extra information on a user page with them —
 * `pnpm check:admin-lane` fails on that.
 */

function adminLaneOpen(state: RootState): boolean {
  return state.userAuth.adminLaneOpen === true;
}

/** ADMIN IDENTITY — any admin row. Only for the way into the admin section. */
export const selectIsAdminPerson = (state: RootState): boolean =>
  state.userAuth.isAdmin;

/** ADMIN IDENTITY — the tier, or null. Only for the way into the admin section. */
export const selectAdminLevelPerson = (state: RootState): AdminLevel | null =>
  state.userAuth.adminLevel;

/** ADMIN IDENTITY — super admin. Only for the way into the admin section. */
export const selectIsSuperAdminPerson = (state: RootState): boolean =>
  state.userAuth.adminLevel === "super_admin";

/*
 * ADMIN DEBUGGING (Arman, 2026-09-28): "the system is still supposed to
 * recognize admins, save it in redux and use it for certain added debugging
 * and special functionality." The admin lane removed admin POWER from user
 * pages; it never meant to blind the admin's own diagnostics. These two
 * selectors gate DEBUG TOOLING ONLY — the Error Inspector, the admin
 * indicator, debug panels, "Copy for AI", technical error detail — tools that
 * show this browser's own session and grant no data, no control, and no
 * record another person can't already see. Every database read behind them
 * still runs without the lane, so RLS answers exactly as it does for anyone.
 * Never gate data or a mutating control with them — use selectIsSuperAdmin.
 */

/** ADMIN DEBUGGING, any tier — true on every page for an admin. Debug tooling only. */
export const selectIsAdminDebugger = (state: RootState): boolean =>
  state.userAuth.isAdmin;

/** ADMIN DEBUGGING, super admin — true on every page. Debug tooling only. */
export const selectIsSuperAdminDebugger = (state: RootState): boolean =>
  state.userAuth.adminLevel === "super_admin";

/*
 * ADMIN FEATURES ON USER PAGES (Arman, 2026-10-06): a control built ON PURPOSE
 * for admins inside a normal page (Linked Agent Sync writing into a system
 * agent). Ambient reach stays off on user pages; a REGISTERED action keeps
 * working there. Only ids in ADMIN_FEATURES_ON_USER_PAGES exist
 * (utils/auth/adminFeaturesOnUserPages.ts); the request the control fires opens
 * the admin lane for itself with `withAdminFeature`.
 */

/** True when this person may use a registered admin feature on any page. */
export const selectAdminFeature = (
  state: RootState,
  feature: AdminFeatureOnUserPageId,
): boolean => adminTierHoldsFeature(state.userAuth.adminLevel, feature);

/** True while the current page is in the admin section. */
export const selectAdminLaneOpen = (state: RootState): boolean =>
  adminLaneOpen(state);

/**
 * ADMIN POWER, any tier. Use only when a feature has deliberately lowered the
 * bar to allow developer / senior_admin in addition to super_admin. Default
 * gates should use `selectIsSuperAdmin`. False on every user page.
 */
export const selectIsAdmin = (state: RootState): boolean =>
  adminLaneOpen(state) && state.userAuth.isAdmin;

/** ADMIN POWER — the tier inside the admin section, null everywhere else. */
export const selectAdminLevel = (state: RootState): AdminLevel | null =>
  adminLaneOpen(state) ? state.userAuth.adminLevel : null;

/**
 * ADMIN POWER, highest bar. The default for every UI gate. False on every
 * user page — an admin there sees exactly what anyone else sees.
 */
export const selectIsSuperAdmin = (state: RootState): boolean =>
  adminLaneOpen(state) && state.userAuth.adminLevel === "super_admin";

/**
 * Authority check for the "creator" role — agentic engineers building agents,
 * shortcuts, content blocks, etc. TRUE only when we are CERTAIN the current
 * user owns the agent currently in context: set by `useCreatorOwnershipSync`
 * on agent build/run/chat/apps pages and aggressively cleared on navigation /
 * when ownership is uncertain. Reads the ownership flag in `creatorDebugSlice`.
 *
 * Pair with `selectIsCreatorMode` / `selectShowCreatorTools` from
 * `lib/redux/preferences/creatorDebugSlice` to gate creator-only UI:
 *
 *     const canSeeCreatorUi = useAppSelector(selectIsCreator);
 *     const creatorModeOn   = useAppSelector(selectIsCreatorMode);
 *     if (!canSeeCreatorUi || !creatorModeOn) return null;
 */
export const selectIsCreator = (state: RootState): boolean =>
  state.creatorDebug.isCreator;

export const selectAccessToken = (state: RootState): string | null =>
  state.userAuth.accessToken;
export const selectAuthReady = (state: RootState): boolean =>
  state.userAuth.authReady;
export const selectIsAuthenticated = (state: RootState): boolean =>
  !!state.userAuth.id;

export const selectUserAppMetadata = createSelector(
  [selectUserAuth],
  (auth) => auth.appMetadata,
);
/** Top-tier models (cost rating 6) — the per-person permission a super admin turns on. Default off. */
export const selectCanUseTopTierModels = createSelector(
  [selectUserAppMetadata],
  (appMetadata) => (appMetadata.permissions ?? []).includes("models.top_tier"),
);
export const selectUserProvider = createSelector(
  [selectUserAppMetadata],
  (appMetadata) => appMetadata.provider,
);
export const selectUserProviders = createSelector(
  [selectUserAppMetadata],
  (appMetadata) => appMetadata.providers,
);
export const selectUserIdentities = createSelector(
  [selectUserAuth],
  (auth) => auth.identities,
);

// ── Profile-domain primitives ────────────────────────────────────────────

export const selectFingerprintId = (state: RootState): string | null =>
  state.userProfile.fingerprintId;

export const selectUserMetadata = createSelector(
  [selectUserProfile],
  (profile) => profile.userMetadata,
);
export const selectUserAvatarUrl = createSelector(
  [selectUserMetadata],
  (userMetadata) => userMetadata.avatarUrl,
);
export const selectUserFullName = createSelector(
  [selectUserMetadata],
  (userMetadata) => userMetadata.fullName,
);
export const selectUserName = createSelector(
  [selectUserMetadata],
  (userMetadata) => userMetadata.name,
);
export const selectUserPreferredUsername = createSelector(
  [selectUserMetadata],
  (userMetadata) => userMetadata.preferredUsername,
);
export const selectUserPicture = createSelector(
  [selectUserMetadata],
  (userMetadata) => userMetadata.picture,
);

// ── Derived display-friendly names ───────────────────────────────────────

export const selectActiveUserId = selectUserId;

export const selectActiveUserName = createSelector(
  [selectUserMetadata],
  (userMetadata) =>
    userMetadata.name ||
    userMetadata.fullName ||
    userMetadata.preferredUsername,
);

export const selectActiveUserAvatarUrl = createSelector(
  [selectUserMetadata],
  (userMetadata) => userMetadata.avatarUrl || userMetadata.picture,
);

export const selectActiveUserInfo = createSelector(
  [selectActiveUserId, selectActiveUserName, selectActiveUserAvatarUrl],
  (id, name, avatarUrl) => ({
    id,
    name,
    avatarUrl,
  }),
);

export const selectDisplayName = createSelector(
  [selectUserMetadata, selectUserEmail],
  (meta, email): string =>
    meta.name ||
    meta.fullName ||
    (email ? email.split("@")[0] : null) ||
    "User",
);

export const selectProfilePhoto = (state: RootState): string | null =>
  state.userProfile.userMetadata.picture ?? null;

// ── Composite legacy `selectUserContext` ─────────────────────────────────

/**
 * Returns a memoized context object with `user` (legacy shape),
 * `isAuthenticated`, `isAdmin` (any level), and `isSuperAdmin` (highest bar).
 * Only use when you genuinely need them together — prefer individual
 * primitive selectors otherwise.
 */
export const selectUserContext = createSelector(
  [selectUser, selectIsAuthenticated, selectIsAdmin, selectIsSuperAdmin],
  (user, isAuthenticated, isAdmin, isSuperAdmin) => ({
    user,
    isAuthenticated,
    isAdmin,
    isSuperAdmin,
  }),
);

// ── Auth token (kept for back-compat with the legacy file's placeholder) ─

/**
 * @deprecated The legacy implementation returned `null` (placeholder).
 * Use `selectAccessToken` for the real value.
 */
export const selectAuthToken = selectAccessToken;

// ── Composite full-data selector ─────────────────────────────────────────

export const selectFullUserData = createSelector(
  [selectUser, selectActiveUserInfo, selectAccessToken],
  (user, activeUserInfo, authToken) => ({
    ...user,
    activeUserInfo,
    authToken,
  }),
);
