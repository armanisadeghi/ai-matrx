// File: lib/redux/slices/userSlice.ts
//
// Phase 4 STRANGLER-FIG SHIM — re-exports the public API of the now-split
// userSlice so consumer files keep compiling. Original 148-line slice has
// been replaced by `userAuthSlice.ts` + `userProfileSlice.ts` per
// decisions.md D1.
//
// This shim is **temporary** within PR 4.B. The follow-up commit migrates
// all consumer imports from `@/lib/redux/slices/userSlice` to direct
// imports from `@/lib/redux/selectors/userSelectors` (selectors) and the
// new slice files (actions). Once all imports are migrated, this file is
// deleted. Per Constitution N2: no permanent coexistence.
//
// What's exported here:
// - All public selectors (re-export from `@/lib/redux/selectors/userSelectors`)
// - All public actions (re-export from new slice files)
// - `setUser` aliased to the `setUserData` thunk (legacy ergonomics)
// - The `default` reducer is INTENTIONALLY removed — rootReducer now mounts
//   `userAuth` + `userProfile` directly. Any consumer that imported the
//   reducer (only rootReducer did) is updated in this PR.

// Selectors — full public API of the old slice file
export {
  selectUser,
  selectUserId,
  selectIsAdmin,
  selectIsSuperAdmin,
  selectAdminLevel,
  selectIsAdminPerson,
  selectIsSuperAdminPerson,
  selectAdminLevelPerson,
  selectAdminLaneOpen,
  selectAccessToken,
  selectFingerprintId,
  selectAuthReady,
  selectShellDataLoaded,
  selectIsAuthenticated,
  selectDisplayName,
  selectProfilePhoto,
  selectUserContext,
} from "@/lib/redux/selectors/userSelectors";

// Actions — split across the two new slices
// Note: `setUser` (legacy) accepted Partial<UserState> spanning both slices.
// `setUserData` thunk preserves that ergonomic; export it as `setUser` so
// consumer call sites don't need rewriting in this shim PR.
export { setUserData as setUser } from "@/lib/redux/thunks/userDataThunk";
export {
  setAccessToken,
  setTokenExpiry,
  setAuthReady,
  clearUserAuth as clearUser,
} from "@/lib/redux/slices/userAuthSlice";
export {
  setShellDataLoaded,
  setFingerprintId,
} from "@/lib/redux/slices/userProfileSlice";
