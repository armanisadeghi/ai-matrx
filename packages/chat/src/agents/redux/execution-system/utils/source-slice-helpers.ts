/**
 * Source Slice Helpers
 *
 * Factory functions that create the standard reducer patterns for
 * Layer 1 (source) slices. Every source slice needs:
 *   - upsert / remove entity
 *   - mark dirty / clear dirty
 *   - loading / error state
 *
 * These helpers eliminate boilerplate while keeping full type safety.
 */

import type { Draft, PayloadAction } from "@reduxjs/toolkit";
import type { SourceSliceState } from "@/features/agents/types/common.types";

/**
 * Creates the initial state for a source slice.
 */
export function createSourceInitialState<T>(): SourceSliceState<T> {
  return {
    byId: {},
    allIds: [],
    dirtyIds: {},
    loading: false,
    error: null,
  };
}

/**
 * Standard reducer for upserting an entity into a source slice.
 * Does NOT mark as dirty — this is for data coming FROM the server.
 */
export function upsertEntity<T extends object>(
  state: Draft<SourceSliceState<T>>,
  id: string,
  data: T,
): void {
  (state.byId as Record<string, T>)[id] = data;
  if (!state.allIds.includes(id)) {
    state.allIds.push(id);
  }
}

/**
 * Standard reducer for removing an entity from a source slice.
 */
export function removeEntity<T>(
  state: Draft<SourceSliceState<T>>,
  id: string,
): void {
  delete (state.byId as Record<string, unknown>)[id];
  state.allIds = state.allIds.filter((i) => i !== id);
  delete state.dirtyIds[id];
}

/**
 * Mark an entity as dirty (has unsaved changes).
 */
export function markDirty<T>(
  state: Draft<SourceSliceState<T>>,
  id: string,
): void {
  state.dirtyIds[id] = true;
}

/**
 * Clear the dirty flag for an entity (after successful save).
 */
export function clearDirty<T>(
  state: Draft<SourceSliceState<T>>,
  id: string,
): void {
  delete state.dirtyIds[id];
}

/**
 * Creates standard extraReducers for async thunk lifecycle.
 * Use in the `extraReducers` builder for fetch/save thunks.
 */
export function createAsyncHandlers<T>() {
  return {
    setPending: (state: Draft<SourceSliceState<T>>) => {
      state.loading = true;
      state.error = null;
    },
    setFulfilled: (state: Draft<SourceSliceState<T>>) => {
      state.loading = false;
      state.error = null;
    },
    setRejected: (
      state: Draft<SourceSliceState<T>>,
      action: PayloadAction<unknown, string, unknown, { message: string }>,
    ) => {
      state.loading = false;
      state.error = action.error?.message ?? "Unknown error";
    },
  };
}
