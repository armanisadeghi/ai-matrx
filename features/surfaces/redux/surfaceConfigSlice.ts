/**
 * surfaceConfigSlice — per-surface resolved config cache (agent roles +
 * namespaced config), keyed by surface name.
 *
 * Filled by `ensureSurfaceConfig` (single-flight per surface). Pages read
 * through `useSurfaceConfig` / `useSurfaceAgentRoles`; write helpers in
 * surface-config.service.ts dispatch `invalidateSurfaceConfig` after a
 * successful write so the next read refetches.
 */

import {
  createAsyncThunk,
  createSlice,
  type PayloadAction,
} from "@reduxjs/toolkit";
import {
  fetchSurfaceConfigBundle,
  resolveSurfaceConfig,
  type ResolvedSurfaceConfig,
} from "@/features/surfaces/services/surface-config.service";

export type SurfaceConfigStatus = "idle" | "loading" | "ready" | "error";

interface SurfaceConfigEntry {
  status: SurfaceConfigStatus;
  resolved: ResolvedSurfaceConfig | null;
  error: string | null;
}

interface SurfaceConfigSliceState {
  bySurfaceName: Record<string, SurfaceConfigEntry>;
}

const initialState: SurfaceConfigSliceState = { bySurfaceName: {} };

const inflight = new Map<string, Promise<ResolvedSurfaceConfig>>();

// NOTE: no RootState import here — this file is in the rootReducer graph and
// importing from lib/redux/store would create a type cycle that poisons the
// store-wide dispatch type. The condition reads its own slice structurally.
interface StateWithSurfaceConfig {
  surfaceConfig?: SurfaceConfigSliceState;
}

export const ensureSurfaceConfig = createAsyncThunk<
  ResolvedSurfaceConfig,
  { surfaceName: string; force?: boolean }
>(
  "surfaceConfig/ensure",
  async ({ surfaceName }) => {
    const existing = inflight.get(surfaceName);
    if (existing) return existing;
    const promise = (async () => {
      const bundle = await fetchSurfaceConfigBundle(surfaceName);
      return resolveSurfaceConfig(bundle);
    })().finally(() => inflight.delete(surfaceName));
    inflight.set(surfaceName, promise);
    return promise;
  },
  {
    condition: ({ surfaceName, force }, { getState }) => {
      if (force) return true;
      const entry = (getState() as StateWithSurfaceConfig).surfaceConfig
        ?.bySurfaceName[surfaceName];
      return !entry || entry.status === "idle" || entry.status === "error";
    },
  },
);

const surfaceConfigSlice = createSlice({
  name: "surfaceConfig",
  initialState,
  reducers: {
    invalidateSurfaceConfig(state, action: PayloadAction<string>) {
      delete state.bySurfaceName[action.payload];
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(ensureSurfaceConfig.pending, (state, action) => {
        const key = action.meta.arg.surfaceName;
        state.bySurfaceName[key] = {
          status: "loading",
          resolved: state.bySurfaceName[key]?.resolved ?? null,
          error: null,
        };
      })
      .addCase(ensureSurfaceConfig.fulfilled, (state, action) => {
        state.bySurfaceName[action.meta.arg.surfaceName] = {
          status: "ready",
          resolved: action.payload,
          error: null,
        };
      })
      .addCase(ensureSurfaceConfig.rejected, (state, action) => {
        state.bySurfaceName[action.meta.arg.surfaceName] = {
          status: "error",
          resolved:
            state.bySurfaceName[action.meta.arg.surfaceName]?.resolved ?? null,
          error: action.error.message ?? "Failed to load surface config",
        };
      });
  },
});

export const { invalidateSurfaceConfig } = surfaceConfigSlice.actions;
export const surfaceConfigReducer = surfaceConfigSlice.reducer;

// ── Selectors ────────────────────────────────────────────────────────────────

export const selectSurfaceConfigEntry = (
  state: StateWithSurfaceConfig,
  surfaceName: string,
): SurfaceConfigEntry | undefined =>
  state.surfaceConfig?.bySurfaceName[surfaceName];
