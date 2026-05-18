/**
 * agentSurfaceBindings — store for `agx_agent_surface` rows.
 *
 * Indexed two ways:
 *   - `byId` — primary, single row by binding uuid
 *   - `idsByAgent` — quick reverse lookup for "all bindings for agent X"
 *
 * Both lookups stay consistent because every mutation routes through the
 * same reducer.
 *
 * The slice owns CRUD state for bindings only; the surfaces catalogue itself
 * lives in `surfacesCatalogSlice`.
 */

"use client";

import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { AgentSurfaceBinding } from "@/features/surfaces/services/agent-surface-bindings.service";

export interface AgentSurfaceBindingsSliceState {
  byId: Record<string, AgentSurfaceBinding>;
  idsByAgent: Record<string, string[]>;
  loadedByAgent: Record<string, boolean>;
  statusByAgent: Record<
    string,
    "idle" | "loading" | "succeeded" | "failed"
  >;
  errorByAgent: Record<string, string | null>;
}

const initialState: AgentSurfaceBindingsSliceState = {
  byId: {},
  idsByAgent: {},
  loadedByAgent: {},
  statusByAgent: {},
  errorByAgent: {},
};

function replaceIdsForAgent(
  state: AgentSurfaceBindingsSliceState,
  agentId: string,
  bindings: AgentSurfaceBinding[],
) {
  // Drop any binding previously associated with this agent — they may have
  // been deleted server-side. New rows get re-inserted below.
  const previousIds = state.idsByAgent[agentId] ?? [];
  for (const id of previousIds) {
    const existing = state.byId[id];
    if (existing && existing.agentId === agentId) {
      delete state.byId[id];
    }
  }
  const newIds: string[] = [];
  for (const b of bindings) {
    state.byId[b.id] = b;
    newIds.push(b.id);
  }
  state.idsByAgent[agentId] = newIds;
}

const agentSurfaceBindingsSlice = createSlice({
  name: "agentSurfaceBindings",
  initialState,
  reducers: {
    setAgentStatus(
      state,
      action: PayloadAction<{
        agentId: string;
        status: "idle" | "loading" | "succeeded" | "failed";
      }>,
    ) {
      state.statusByAgent[action.payload.agentId] = action.payload.status;
    },
    setAgentError(
      state,
      action: PayloadAction<{ agentId: string; error: string | null }>,
    ) {
      state.errorByAgent[action.payload.agentId] = action.payload.error;
    },

    setBindingsForAgent(
      state,
      action: PayloadAction<{
        agentId: string;
        bindings: AgentSurfaceBinding[];
      }>,
    ) {
      replaceIdsForAgent(state, action.payload.agentId, action.payload.bindings);
      state.loadedByAgent[action.payload.agentId] = true;
      state.statusByAgent[action.payload.agentId] = "succeeded";
      state.errorByAgent[action.payload.agentId] = null;
    },

    upsertBinding(state, action: PayloadAction<AgentSurfaceBinding>) {
      const b = action.payload;
      state.byId[b.id] = b;
      const ids = state.idsByAgent[b.agentId] ?? [];
      if (!ids.includes(b.id)) {
        state.idsByAgent[b.agentId] = [...ids, b.id];
      }
    },

    removeBinding(state, action: PayloadAction<string>) {
      const existing = state.byId[action.payload];
      if (!existing) return;
      delete state.byId[action.payload];
      const ids = state.idsByAgent[existing.agentId] ?? [];
      state.idsByAgent[existing.agentId] = ids.filter(
        (id) => id !== action.payload,
      );
    },
  },
});

export const {
  setAgentStatus,
  setAgentError,
  setBindingsForAgent,
  upsertBinding,
  removeBinding,
} = agentSurfaceBindingsSlice.actions;

export const agentSurfaceBindingsReducer = agentSurfaceBindingsSlice.reducer;
export default agentSurfaceBindingsReducer;
