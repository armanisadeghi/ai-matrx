'use client';

import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import type { ContextMenuRow } from '@/utils/supabase/ssrShellData';

export interface ContextMenuCacheState {
  rows: ContextMenuRow[];
  hydrated: boolean;
}

const initialState: ContextMenuCacheState = {
  rows: [],
  hydrated: false,
};

/**
 * Legacy cache for raw context_menu_unified_view rows.
 * Its v1 reader (features/context-menu/UnifiedContextMenu) was deleted with
 * the prompts system (D25), and the dead DeferredShellData preload was removed
 * 2026-07-07 — the slice currently has no writer or reader. Kept by explicit
 * D25 disposition (slice stays; only the dead data flow was removed).
 */
const contextMenuCacheSlice = createSlice({
  name: 'contextMenuCache',
  initialState,
  reducers: {
    setContextMenuRows(state, action: PayloadAction<ContextMenuRow[]>) {
      state.rows = action.payload;
      console.log("[contextMenuCacheSlice] setContextMenuRows: ", state.rows.length);
      state.hydrated = true;
    },
    clearContextMenuCache(state) {
      state.rows = [];
      state.hydrated = false;
      console.log("[contextMenuCacheSlice] clearContextMenuCache Cleared Cache");
    },
  },
});

export const { setContextMenuRows, clearContextMenuCache } = contextMenuCacheSlice.actions;

// Selectors typed against a minimal shape — compatible with public/bootstrap state
// and any state that includes contextMenuCache
export const selectContextMenuRows = (state: { contextMenuCache: ContextMenuCacheState }) =>
  state.contextMenuCache.rows;

export const selectContextMenuHydrated = (state: { contextMenuCache: ContextMenuCacheState }) =>
  state.contextMenuCache.hydrated;

export default contextMenuCacheSlice.reducer;
