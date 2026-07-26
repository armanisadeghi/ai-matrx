import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

interface UrlSyncEntry {
    typeKey: string;
    instanceId: string;
    args?: Record<string, string>;
}

interface UrlSyncState {
    entries: Record<string, UrlSyncEntry>; // Keyed by `${typeKey}:${instanceId}`
    isHydrated: boolean;
}

const initialState: UrlSyncState = {
    entries: {},
    isHydrated: false,
};

export const urlSyncSlice = createSlice({
    name: 'urlSync',
    initialState,
    reducers: {
        setHydrated: (state) => {
            state.isHydrated = true;
        },
        registerSyncEntry: (state, action: PayloadAction<UrlSyncEntry>) => {
            const key = `${action.payload.typeKey}:${action.payload.instanceId}`;
            state.entries[key] = action.payload;
        },
        unregisterSyncEntry: (state, action: PayloadAction<{ typeKey: string; instanceId: string }>) => {
            const key = `${action.payload.typeKey}:${action.payload.instanceId}`;
            delete state.entries[key];
        },
    },
});

export const { setHydrated, registerSyncEntry, unregisterSyncEntry } = urlSyncSlice.actions;

export const selectUrlSyncEntries = (state: { urlSync: UrlSyncState }) => state.urlSync.entries;
export const selectIsUrlHydrated = (state: { urlSync: UrlSyncState }) => state.urlSync.isHydrated;

export default urlSyncSlice.reducer;
