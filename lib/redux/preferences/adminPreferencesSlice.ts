// lib/redux/slices/adminPreferencesSlice.ts
// Lightweight admin preferences - only used when user is admin
// No impact on non-admin users

import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

/**
 * Named server environments.
 *
 * - 'production'  → NEXT_PUBLIC_BACKEND_URL_PROD (default, used by all non-admin requests)
 * - 'development' → NEXT_PUBLIC_BACKEND_URL_DEV
 * - 'staging'     → NEXT_PUBLIC_BACKEND_URL_STAGING
 * - 'localhost'   → NEXT_PUBLIC_BACKEND_URL_LOCAL
 * - 'gpu'         → NEXT_PUBLIC_BACKEND_URL_GPU
 * - 'custom'      → adminPreferencesState.customServerUrl (admin-entered string)
 *
 * New environments can be added here and in lib/api/endpoints.ts without
 * touching any call sites.
 */
export type ServerEnvironment =
  | "production"
  | "development"
  | "staging"
  | "localhost"
  | "gpu"
  | "custom";

type PersistedServerEnvironment = ServerEnvironment | "ec2";

interface AdminPreferencesState {
  /**
   * Which server environment the admin wants to hit.
   * null = use production (the default for all users).
   */
  serverOverride: PersistedServerEnvironment | null;

  /** A stale runtime EC2 full-API override was migrated to production. */
  retiredEc2ApiSelectionNotice: boolean;

  /**
   * Only used when serverOverride === 'custom'.
   * Must be a full origin string, e.g. 'https://my-preview.app.matrxserver.com'
   */
  customServerUrl: string | null;

  /**
   * Admin/dev override for desktop tool delegation.
   *
   * null = Auto / installed app. The request omits target_instance_id and
   * aidream uses today's routing behavior.
   *
   * string = app_instances.instance_id for a specific matrx-local desktop
   * engine. Agent turns stamp target_instance_id so aidream routes delegated
   * desktop tools to that exact engine.
   */
  desktopTargetInstanceId: string | null;
}

const initialState: AdminPreferencesState = {
  serverOverride: null,
  retiredEc2ApiSelectionNotice: false,
  customServerUrl: null,
  desktopTargetInstanceId: null,
};

const adminPreferencesSlice = createSlice({
  name: "adminPreferences",
  initialState,
  reducers: {
    setServerOverride: (
      state,
      action: PayloadAction<ServerEnvironment | null>,
    ) => {
      // The action type excludes retired values, but a stale preloaded Redux
      // state or legacy caller can still deliver this runtime literal.
      state.serverOverride = action.payload;
      // Clear the custom URL when switching away from 'custom'
      if (action.payload !== "custom") {
        state.customServerUrl = null;
      }
    },
    setCustomServerUrl: (state, action: PayloadAction<string>) => {
      state.serverOverride = "custom";
      state.customServerUrl = action.payload;
    },
    /** Normalize a stale preloaded override before any selected-backend call. */
    migrateRetiredEc2ServerOverride: (state) => {
      if (state.serverOverride !== "ec2") return;
      state.serverOverride = "production";
      state.customServerUrl = null;
      state.retiredEc2ApiSelectionNotice = true;
    },
    acknowledgeRetiredEc2ServerOverrideNotice: (state) => {
      state.retiredEc2ApiSelectionNotice = false;
    },
    setDesktopTargetInstanceId: (
      state,
      action: PayloadAction<string | null>,
    ) => {
      state.desktopTargetInstanceId = action.payload;
    },
    clearAdminPreferences: () => initialState,
  },
});

export const {
  setServerOverride,
  setCustomServerUrl,
  migrateRetiredEc2ServerOverride,
  acknowledgeRetiredEc2ServerOverrideNotice,
  setDesktopTargetInstanceId,
  clearAdminPreferences,
} = adminPreferencesSlice.actions;
export default adminPreferencesSlice.reducer;

// Selectors — use generic state type to avoid importing full store
type StateWithAdminPreferences = { adminPreferences: AdminPreferencesState };

export const selectServerOverride = (
  state: StateWithAdminPreferences,
): ServerEnvironment | null =>
  state.adminPreferences.serverOverride === "ec2"
    ? "production"
    : state.adminPreferences.serverOverride;

export const selectRetiredEc2ServerOverride = (
  state: StateWithAdminPreferences,
): boolean => state.adminPreferences.serverOverride === "ec2";

export const selectRetiredEc2ServerOverrideNotice = (
  state: StateWithAdminPreferences,
): boolean => state.adminPreferences.retiredEc2ApiSelectionNotice;

export const selectCustomServerUrl = (
  state: StateWithAdminPreferences,
): string | null => state.adminPreferences.customServerUrl;

export const selectDesktopTargetInstanceId = (
  state: StateWithAdminPreferences,
): string | null => state.adminPreferences.desktopTargetInstanceId;

export const selectEffectiveServer = (
  state: StateWithAdminPreferences,
): ServerEnvironment => {
  const selected = state.adminPreferences.serverOverride;
  return selected === "ec2" ? "production" : (selected ?? "production");
};

/** Backward-compatible — true only when explicitly set to 'localhost' */
export const selectIsUsingLocalhost = (
  state: StateWithAdminPreferences,
): boolean => state.adminPreferences.serverOverride === "localhost";
