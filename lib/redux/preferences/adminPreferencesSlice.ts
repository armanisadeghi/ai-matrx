// lib/redux/slices/adminPreferencesSlice.ts
// Lightweight admin preferences - only used when user is admin
// No impact on non-admin users

import { createSlice, PayloadAction } from '@reduxjs/toolkit';

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
    | 'production'
    | 'development'
    | 'staging'
    | 'localhost'
    | 'gpu'
    | 'custom';

interface AdminPreferencesState {
    /**
     * Which server environment the admin wants to hit.
     * null = use production (the default for all users).
     */
    serverOverride: ServerEnvironment | null;

    /**
     * Only used when serverOverride === 'custom'.
     * Must be a full origin string, e.g. 'https://my-preview.app.matrxserver.com'
     */
    customServerUrl: string | null;
}

const initialState: AdminPreferencesState = {
    serverOverride: null,
    customServerUrl: null,
};

const adminPreferencesSlice = createSlice({
    name: 'adminPreferences',
    initialState,
    reducers: {
        setServerOverride: (state, action: PayloadAction<ServerEnvironment | null>) => {
            state.serverOverride = action.payload;
            // Clear the custom URL when switching away from 'custom'
            if (action.payload !== 'custom') {
                state.customServerUrl = null;
            }
        },
        setCustomServerUrl: (state, action: PayloadAction<string>) => {
            state.serverOverride = 'custom';
            state.customServerUrl = action.payload;
        },
        clearAdminPreferences: () => initialState,
    },
});

export const { setServerOverride, setCustomServerUrl, clearAdminPreferences } =
    adminPreferencesSlice.actions;
export default adminPreferencesSlice.reducer;

// Selectors — use generic state type to avoid importing full store
type StateWithAdminPreferences = { adminPreferences: AdminPreferencesState };

export const selectServerOverride = (state: StateWithAdminPreferences): ServerEnvironment | null =>
    state.adminPreferences.serverOverride;

export const selectCustomServerUrl = (state: StateWithAdminPreferences): string | null =>
    state.adminPreferences.customServerUrl;

export const selectEffectiveServer = (state: StateWithAdminPreferences): ServerEnvironment =>
    state.adminPreferences.serverOverride ?? 'production';

/** Backward-compatible — true only when explicitly set to 'localhost' */
export const selectIsUsingLocalhost = (state: StateWithAdminPreferences): boolean =>
    state.adminPreferences.serverOverride === 'localhost';
