/**
 * surfacesCatalog — canonical store for `ui_surface` + `ui_surface_value`.
 *
 * Why a slice and not just per-component fetches: the agent-surface binding
 * editor, the upcoming shortcut "seed from surface" flow, and the surfaces
 * admin page all want the same catalog. With the catalog in Redux, opening
 * the editor a second time hits the cache instead of round-tripping
 * Supabase.
 *
 * State shape:
 *   - `list`: the active surfaces from `ui_surface` (sorted by sort_order then name)
 *   - `valuesBySurface`: each surface's `ui_surface_value` rows, lazily filled
 *   - `loaded` flags so consumers don't loop dispatches
 *
 * Note: the slice key is `surfacesCatalog`, not `surfaces`, because the
 * latter is taken by the (unrelated) surface navigation registry at
 * `features/agents/redux/surfaces/`.
 */

"use client";

import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type {
  SurfaceValue,
} from "@/features/surfaces/types";
import type { SurfaceWithStats } from "@/features/surfaces/services/surfaces.service";

export interface SurfacesCatalogSliceState {
  list: SurfaceWithStats[];
  listLoaded: boolean;
  listStatus: "idle" | "loading" | "succeeded" | "failed";
  listError: string | null;

  valuesBySurface: Record<string, SurfaceValue[]>;
  valuesLoaded: Record<string, boolean>;
  valuesStatus: Record<string, "idle" | "loading" | "succeeded" | "failed">;
  valuesError: Record<string, string | null>;
}

const initialState: SurfacesCatalogSliceState = {
  list: [],
  listLoaded: false,
  listStatus: "idle",
  listError: null,

  valuesBySurface: {},
  valuesLoaded: {},
  valuesStatus: {},
  valuesError: {},
};

const surfacesCatalogSlice = createSlice({
  name: "surfacesCatalog",
  initialState,
  reducers: {
    setListStatus(
      state,
      action: PayloadAction<SurfacesCatalogSliceState["listStatus"]>,
    ) {
      state.listStatus = action.payload;
    },
    setListError(state, action: PayloadAction<string | null>) {
      state.listError = action.payload;
    },
    setSurfaces(state, action: PayloadAction<SurfaceWithStats[]>) {
      state.list = action.payload;
      state.listLoaded = true;
      state.listStatus = "succeeded";
      state.listError = null;
    },

    setValuesStatus(
      state,
      action: PayloadAction<{
        surfaceName: string;
        status: "idle" | "loading" | "succeeded" | "failed";
      }>,
    ) {
      state.valuesStatus[action.payload.surfaceName] = action.payload.status;
    },
    setValuesError(
      state,
      action: PayloadAction<{ surfaceName: string; error: string | null }>,
    ) {
      state.valuesError[action.payload.surfaceName] = action.payload.error;
    },
    setValuesForSurface(
      state,
      action: PayloadAction<{ surfaceName: string; values: SurfaceValue[] }>,
    ) {
      const { surfaceName, values } = action.payload;
      state.valuesBySurface[surfaceName] = values;
      state.valuesLoaded[surfaceName] = true;
      state.valuesStatus[surfaceName] = "succeeded";
      state.valuesError[surfaceName] = null;
    },

    clearCatalog(state) {
      state.list = [];
      state.listLoaded = false;
      state.listStatus = "idle";
      state.listError = null;
      state.valuesBySurface = {};
      state.valuesLoaded = {};
      state.valuesStatus = {};
      state.valuesError = {};
    },
  },
});

export const {
  setListStatus,
  setListError,
  setSurfaces,
  setValuesStatus,
  setValuesError,
  setValuesForSurface,
  clearCatalog,
} = surfacesCatalogSlice.actions;

export const surfacesCatalogReducer = surfacesCatalogSlice.reducer;
export default surfacesCatalogReducer;
