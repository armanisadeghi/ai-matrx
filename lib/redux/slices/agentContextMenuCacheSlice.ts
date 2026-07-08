"use client";

import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import type { ContextMenuRow } from "@/utils/supabase/ssrShellData";

export interface AgentContextMenuCacheState {
  rows: ContextMenuRow[];
  hydrated: boolean;
}

const initialState: AgentContextMenuCacheState = {
  rows: [],
  hydrated: false,
};

/**
 * Cache for raw agent.context_menu_view rows. The planned "warm signal" read
 * in useUnifiedAgentContextMenu was never wired — the v2/v3 menu fetches on
 * open via /api/agent-context-menu (fetchUnifiedMenu thunk). The dead
 * DeferredShellData preload (and its get_ssr_agent_shell_data RPC call) was
 * removed 2026-07-07 (D25 residual cleanup); the slice currently has no
 * writer or reader and is kept alongside contextMenuCacheSlice per the same
 * D25 disposition.
 */
const agentContextMenuCacheSlice = createSlice({
  name: "agentContextMenuCache",
  initialState,
  reducers: {
    setAgentContextMenuRows(state, action: PayloadAction<ContextMenuRow[]>) {
      state.rows = action.payload;
      state.hydrated = true;
    },
    clearAgentContextMenuCache(state) {
      state.rows = [];
      state.hydrated = false;
    },
  },
});

export const { setAgentContextMenuRows, clearAgentContextMenuCache } =
  agentContextMenuCacheSlice.actions;

// Selectors typed against a minimal shape — compatible with public/bootstrap state
// and any state that includes agentContextMenuCache
export const selectAgentContextMenuRows = (state: {
  agentContextMenuCache: AgentContextMenuCacheState;
}) => state.agentContextMenuCache.rows;

export const selectAgentContextMenuHydrated = (state: {
  agentContextMenuCache: AgentContextMenuCacheState;
}) => state.agentContextMenuCache.hydrated;

export default agentContextMenuCacheSlice.reducer;
