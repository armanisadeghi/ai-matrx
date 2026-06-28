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
 * Stores raw agent.context_menu_view rows fetched server-side via
 * get_ssr_agent_shell_data() RPC (additive companion to the legacy
 * get_ssr_shell_data() RPC). Populated once at hydration time from
 * the SSR shell data call — DeferredShellData writes here in parallel
 * with the legacy contextMenuCache.
 *
 * The Phase 3 useUnifiedAgentContextMenu hook prefers this slice as its
 * "warm" signal so first-paint avoids waiting on the legacy view during
 * the prompts→agents migration. Once the legacy prompt system is removed
 * (Phase 18), this slice becomes the sole context-menu SSR cache.
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
