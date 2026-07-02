// lib/redux/thunks/overlayThunks.ts
//
// Thunks for the instanced overlay system.
//
// openOverlayInstance — the primary entry point for opening any overlay with
// full instance management. It:
//   1. Resolves the instanceId (caller-supplied UUID or 'default')
//   2. Checks overlayDataSlice for an existing saved state for this instance
//   3. If saved state exists → reopens with that (persistence within the session)
//   4. If no saved state → merges schema defaults with caller data and writes it
//   5. Opens the overlay via overlaySlice
//   6. Returns the instanceId so the caller can store it for later reference
//
// Persistence model:
//   - When a user edits content in an overlay and saves (onSave fires),
//     OverlayController writes the new content back to overlayDataSlice.
//   - The next time the same instanceId is passed to openOverlayInstance,
//     this thunk finds that saved data and re-hydrates the overlay with it.
//   - This gives per-instance session persistence without any DB round-trips.
//
// Usage (singleton — same as all existing dispatches):
//   const instanceId = await dispatch(openOverlayInstance({
//     overlayId: 'fullScreenEditor',
//     data: { content: '# Hello' },
//   })).unwrap();
//   // instanceId === 'default'
//
// Usage (instanced — new):
//   const myId = crypto.randomUUID();
//   await dispatch(openOverlayInstance({
//     overlayId: 'htmlPreview',
//     instanceId: myId,
//     data: { content: '<h1>My page</h1>' },
//   })).unwrap();
//   // Renders a second independent HtmlPreview alongside any existing default one
//   // Next time called with the same myId, the last-saved content is restored.

import { createAsyncThunk } from "@reduxjs/toolkit";
import { overlaySchemaRegistry } from "../overlaySchemaRegistry";
import { setOverlayData, selectOverlayData } from "../slices/overlayDataSlice";
import { openOverlay, DEFAULT_INSTANCE_ID } from "../slices/overlaySlice";
import type { RootState } from "../store";
import type { OverlayId } from "@/features/window-panels/registry/overlay-ids";

// ============================================================================
// TYPES
// ============================================================================

export interface OpenOverlayInstancePayload {
  /** The overlayId key from overlaySlice initialState (e.g. 'htmlPreview'). */
  overlayId: OverlayId;
  /**
   * Caller-supplied UUID for an isolated instance.
   * Omit (or pass undefined) to use the singleton 'default' instance.
   */
  instanceId?: string;
  /**
   * Data to open the overlay with. If a schema is registered for this overlayId,
   * schema defaults are merged in first, then this data overrides them.
   *
   * If overlayDataSlice already has saved state for this instanceId (from a
   * prior onSave), caller data is ignored in favour of the saved state so the
   * user's edits are not overwritten on re-open.
   */
  data?: Record<string, unknown>;
  /**
   * When true, always use caller data even if saved state exists.
   * Useful when the caller explicitly wants to reset the instance to fresh content.
   */
  forceReset?: boolean;
}

// ============================================================================
// THUNK
// ============================================================================

export const openOverlayInstance = createAsyncThunk<
  string, // return value: the resolved instanceId
  OpenOverlayInstancePayload,
  { state: RootState }
>("overlays/openInstance", async (payload, { dispatch, getState }) => {
  const instanceId = payload.instanceId ?? DEFAULT_INSTANCE_ID;

  // Check whether we already have saved state for this instance
  const existingEntry = selectOverlayData(
    getState(),
    payload.overlayId,
    instanceId,
  );

  let resolvedData: Record<string, unknown> | null;

  if (existingEntry && !payload.forceReset) {
    // Re-opening an existing instance — restore saved state, ignore caller data.
    // The overlay controller uses initialContent from this data blob, so the
    // user gets back exactly where they left off.
    resolvedData = existingEntry.data as Record<string, unknown>;
  } else {
    // First open (or forced reset) — merge schema defaults with caller data.
    const schema = overlaySchemaRegistry[payload.overlayId];
    resolvedData = schema
      ? { ...schema.defaults, ...payload.data }
      : (payload.data ?? null);

    // Write the initial data into overlayDataSlice
    if (resolvedData !== null) {
      dispatch(
        setOverlayData({
          overlayId: payload.overlayId,
          instanceId,
          type: payload.overlayId,
          data: resolvedData,
        }),
      );
    }
  }

  // Open the overlay instance in overlaySlice (the rendering gate)
  dispatch(
    openOverlay({
      overlayId: payload.overlayId,
      instanceId,
      data: resolvedData,
    }),
  );

  return instanceId;
});
