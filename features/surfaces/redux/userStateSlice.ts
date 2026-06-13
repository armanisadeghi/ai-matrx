// features/surfaces/user-state/slice.ts
//
// Redux cache for user_surface_state, keyed by feature. The resolution
// (surface_key → '_default' → caller defaults) happens in useSurfaceUserState;
// this slice just holds the raw rows + load lifecycle, with module-scoped
// in-flight dedup on the loader thunk.

import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { AppThunk } from "@/lib/redux/store";
import { requireUserId } from "@/utils/auth/getUserId";
import {
  surfaceUserStateService,
  type SurfaceStateRows,
} from "@/features/surfaces/user-state/service";

type LoadStatus = "idle" | "loading" | "ready" | "error";

interface FeatureState {
  status: LoadStatus;
  error: string | null;
  fetchedAt: number | null;
  rows: SurfaceStateRows;
}

interface SurfaceUserStateSlice {
  byFeature: Record<string, FeatureState>;
}

const initialState: SurfaceUserStateSlice = { byFeature: {} };

function ensureFeature(state: SurfaceUserStateSlice, feature: string): FeatureState {
  if (!state.byFeature[feature]) {
    state.byFeature[feature] = { status: "idle", error: null, fetchedAt: null, rows: {} };
  }
  return state.byFeature[feature];
}

const slice = createSlice({
  name: "surfaceUserState",
  initialState,
  reducers: {
    featureLoading(state, action: PayloadAction<string>) {
      const f = ensureFeature(state, action.payload);
      f.status = "loading";
      f.error = null;
    },
    featureReceived(
      state,
      action: PayloadAction<{ feature: string; rows: SurfaceStateRows }>,
    ) {
      const f = ensureFeature(state, action.payload.feature);
      f.rows = action.payload.rows;
      f.status = "ready";
      f.error = null;
      f.fetchedAt = Date.now();
    },
    featureError(state, action: PayloadAction<{ feature: string; error: string }>) {
      const f = ensureFeature(state, action.payload.feature);
      f.status = "error";
      f.error = action.payload.error;
    },
    // Optimistic local write of one surface_key row.
    rowSet(
      state,
      action: PayloadAction<{ feature: string; surfaceKey: string; state: Record<string, unknown> }>,
    ) {
      const f = ensureFeature(state, action.payload.feature);
      f.rows[action.payload.surfaceKey] = action.payload.state;
    },
  },
});

export const surfaceUserStateActions = slice.actions;
export const surfaceUserStateReducer = slice.reducer;

// ── thunks ──────────────────────────────────────────────────────────────

const inflight = new Map<string, Promise<void>>();
const TTL_MS = 30_000;

/** Load a feature's rows once (dedup in-flight + skip if fresh). */
export function ensureSurfaceFeatureLoaded(feature: string, force = false): AppThunk<Promise<void>> {
  return async (dispatch, getState) => {
    const existing = getState().surfaceUserState.byFeature[feature];
    if (
      !force &&
      existing?.status === "ready" &&
      existing.fetchedAt &&
      Date.now() - existing.fetchedAt < TTL_MS
    ) {
      return;
    }
    const pending = inflight.get(feature);
    if (pending && !force) return pending;

    const p = (async () => {
      dispatch(surfaceUserStateActions.featureLoading(feature));
      try {
        const rows = await surfaceUserStateService.loadFeature(feature);
        dispatch(surfaceUserStateActions.featureReceived({ feature, rows }));
      } catch (e) {
        dispatch(
          surfaceUserStateActions.featureError({ feature, error: (e as Error).message }),
        );
      } finally {
        inflight.delete(feature);
      }
    })();
    inflight.set(feature, p);
    return p;
  };
}

/** Write one surface_key row (optimistic + persisted). */
export function saveSurfaceState(
  feature: string,
  surfaceKey: string,
  state: Record<string, unknown>,
): AppThunk<Promise<void>> {
  return async (dispatch) => {
    dispatch(surfaceUserStateActions.rowSet({ feature, surfaceKey, state }));
    try {
      await surfaceUserStateService.save(requireUserId(), feature, surfaceKey, state);
    } catch (e) {
      // Loud recovery: surface the failure; local state already updated.
      console.error("[surfaceUserState] save failed", e);
      throw e;
    }
  };
}
