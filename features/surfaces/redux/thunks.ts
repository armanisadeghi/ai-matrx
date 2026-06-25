"use client";

import { createAsyncThunk } from "@reduxjs/toolkit";
import type { AppDispatch, RootState } from "@/lib/redux/store";
import {
  listSurfacesWithStats,
  listSurfaceValues,
  type SurfaceWithStats,
} from "@/features/surfaces/services/surfaces.service";
import {
  listAgentSurfaceBindings,
  upsertAgentSurfaceBinding,
  deleteAgentSurfaceBinding,
  bulkUpsertAgentSurfaceBindings,
  type AgentSurfaceBinding,
  type ScopeInput,
  type BulkUpsertBindingInput,
  type BulkUpsertResult,
} from "@/features/surfaces/services/agent-surface-bindings.service";
import type { SurfaceValue, ValueMappingMap } from "@/features/surfaces/types";
import {
  setListStatus,
  setListError,
  setSurfaces,
  setValuesStatus,
  setValuesError,
  setValuesForSurface,
} from "./surfacesCatalogSlice";
import {
  setAgentStatus,
  setAgentError,
  setBindingsForAgent,
  upsertBinding,
  removeBinding,
} from "./agentSurfaceBindingsSlice";

type ThunkApi = { dispatch: AppDispatch; state: RootState };

interface LoadOpts {
  /** Re-fetch even if already loaded. */
  force?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Surfaces catalogue (ui_surface + ui_surface_value)
// ─────────────────────────────────────────────────────────────────────────────

export const loadSurfaces = createAsyncThunk<
  SurfaceWithStats[],
  LoadOpts | void,
  ThunkApi
>("surfacesCatalog/loadSurfaces", async (opts, { dispatch, getState }) => {
  const force = !!(opts && opts.force);
  if (!force && getState().surfacesCatalog.listLoaded) {
    return getState().surfacesCatalog.list;
  }
  dispatch(setListStatus("loading"));
  try {
    const list = await listSurfacesWithStats();
    dispatch(setSurfaces(list));
    return list;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load surfaces";
    dispatch(setListError(message));
    dispatch(setListStatus("failed"));
    throw error;
  }
});

export const loadSurfaceValues = createAsyncThunk<
  SurfaceValue[],
  { surfaceName: string } & LoadOpts,
  ThunkApi
>(
  "surfacesCatalog/loadSurfaceValues",
  async ({ surfaceName, force }, { dispatch, getState }) => {
    if (!force && getState().surfacesCatalog.valuesLoaded[surfaceName]) {
      return getState().surfacesCatalog.valuesBySurface[surfaceName] ?? [];
    }
    dispatch(setValuesStatus({ surfaceName, status: "loading" }));
    try {
      const values = await listSurfaceValues(surfaceName);
      dispatch(setValuesForSurface({ surfaceName, values }));
      return values;
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : `Failed to load values for ${surfaceName}`;
      dispatch(setValuesError({ surfaceName, error: message }));
      dispatch(setValuesStatus({ surfaceName, status: "failed" }));
      throw error;
    }
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Agent ↔ surface bindings (agx_agent_surface)
// ─────────────────────────────────────────────────────────────────────────────

export const loadBindingsForAgent = createAsyncThunk<
  AgentSurfaceBinding[],
  { agentId: string } & LoadOpts,
  ThunkApi
>(
  "agentSurfaceBindings/loadForAgent",
  async ({ agentId, force }, { dispatch, getState }) => {
    if (!force && getState().agentSurfaceBindings.loadedByAgent[agentId]) {
      const ids = getState().agentSurfaceBindings.idsByAgent[agentId] ?? [];
      return ids
        .map((id) => getState().agentSurfaceBindings.byId[id])
        .filter((b): b is AgentSurfaceBinding => !!b);
    }
    dispatch(setAgentStatus({ agentId, status: "loading" }));
    try {
      const bindings = await listAgentSurfaceBindings(agentId);
      dispatch(setBindingsForAgent({ agentId, bindings }));
      return bindings;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to load bindings";
      dispatch(setAgentError({ agentId, error: message }));
      dispatch(setAgentStatus({ agentId, status: "failed" }));
      throw error;
    }
  },
);

export interface UpsertBindingArgs {
  agentId: string;
  surfaceName: string;
  scope: ScopeInput;
  valueMappings: ValueMappingMap;
}

export const upsertAgentSurfaceBindingThunk = createAsyncThunk<
  AgentSurfaceBinding,
  UpsertBindingArgs,
  ThunkApi
>("agentSurfaceBindings/upsert", async (args, { dispatch }) => {
  const saved = await upsertAgentSurfaceBinding(args);
  dispatch(upsertBinding(saved));
  return saved;
});

export const deleteAgentSurfaceBindingThunk = createAsyncThunk<
  void,
  { bindingId: string },
  ThunkApi
>("agentSurfaceBindings/delete", async ({ bindingId }, { dispatch }) => {
  await deleteAgentSurfaceBinding(bindingId);
  dispatch(removeBinding(bindingId));
});

/**
 * Batch upsert bindings across many surfaces for one agent. Each surface is an
 * independent single-row write (see the service), so the slice is kept in sync
 * by dispatching the existing `upsertBinding` reducer for every row that saved.
 * Returns the full result so the caller can report partial failures.
 */
export const bulkUpsertAgentSurfaceBindingsThunk = createAsyncThunk<
  BulkUpsertResult,
  { agentId: string; bindings: BulkUpsertBindingInput[] },
  ThunkApi
>("agentSurfaceBindings/bulkUpsert", async (args, { dispatch }) => {
  const result = await bulkUpsertAgentSurfaceBindings(args);
  for (const binding of result.succeeded) {
    dispatch(upsertBinding(binding));
  }
  return result;
});
