// lib/redux/slices/overlaySlice.ts
//
// Instanced overlay state management.
//
// Every overlay supports two modes:
//   Singleton (default): dispatch(openHtmlPreview({ content }))
//     → uses instanceId 'default', one shared instance, existing behavior unchanged
//   Instanced: dispatch(openHtmlPreview({ content, instanceId: 'my-uuid' }))
//     → isolated instance, independent open/close/data, multiple can coexist
//
// State shape:
//   overlays: Record<overlayId, Record<instanceId, { isOpen: boolean; data: any }>>
//
// All existing callers that omit instanceId continue to work with zero changes.

import { createSlice, createSelector } from "@reduxjs/toolkit";
import type { OverlayId } from "@/features/window-panels/registry/overlay-ids";

export const DEFAULT_INSTANCE_ID = "default";

// ============================================================================
// PUBLIC ACTION PAYLOAD TYPES
// ============================================================================
// Use these at every call site:
//   dispatch(openOverlay({ overlayId: "feedbackDialog" }))
//   dispatch(openOverlay({ overlayId: "saveToNotes", data: { initialContent: "..." } }))
//
// `overlayId` is narrowed to the `OverlayId` string-literal union so a typo
// is a compile-time error. The check-registry script verifies that the
// union stays in sync with the registry on every build.

export interface OpenOverlayPayload {
  overlayId: OverlayId;
  instanceId?: string;
  data?: unknown;
}

export interface CloseOverlayPayload {
  overlayId: OverlayId;
  instanceId?: string;
}

export interface ToggleOverlayPayload {
  overlayId: OverlayId;
  instanceId?: string;
  data?: unknown;
}

export interface CloseAllInstancesPayload {
  overlayId: OverlayId;
}

export interface PruneStaleInstancesPayload {
  olderThanMs: number;
}

/**
 * Mode for the full-screen markdown editor overlay (`overlayId:
 * "fullScreenEditor"`). Tells the editor which save thunk to dispatch on
 * submit, so callers don't have to stash a closure-bearing `onSave`
 * callback in Redux state.
 *
 *   "assistant-message" → editMessage thunk against cx_message
 *   "user-message"      → editUserMessage thunk (message + truncate)
 *   "free"              → no automatic dispatch; legacy onSave callback
 *                          (for callers not yet migrated)
 */
export type FullScreenEditorMode =
  | "assistant-message"
  | "user-message"
  | "free";

// ============================================================================
// TYPES
// ============================================================================

export interface OverlayInstance {
  isOpen: boolean;
  data: unknown;
  /**
   * Unix ms timestamp of the last open action. Used by `pruneStaleInstances`
   * to GC long-forgotten closed entries. Set on every open, untouched on
   * close so the age reflects when the user last used it.
   */
  lastUsedAt?: number;
}

export interface OverlayState {
  overlays: Record<string, Record<string, OverlayInstance>>;
}

// ============================================================================
// INITIAL STATE
// ============================================================================
//
// Empty by design. Overlay keys are added lazily on first `openOverlay`
// (matches the registry — see `features/window-panels/registry/windowRegistry.ts`).
// Prior to 2026-04 this file hand-mirrored 77 registry keys; drift between
// registry and slice caused silent no-ops for unlisted overlays.

const initialState: OverlayState = {
  overlays: {},
};

// ============================================================================
// SLICE
// ============================================================================

const overlaySlice = createSlice({
  name: "overlays",
  initialState,
  reducers: {
    openOverlay: (state, action) => {
      const {
        overlayId,
        instanceId = DEFAULT_INSTANCE_ID,
        data,
      } = action.payload;
      if (overlayId === "createProjectWindow") {
        console.log(
          "[Track New Project] 5, overlaySlice.ts — openOverlay reducer",
          {
            overlayId,
            instanceId,
            data,
          },
        );
      }
      if (!state.overlays[overlayId]) {
        state.overlays[overlayId] = {};
      }
      state.overlays[overlayId][instanceId] = {
        isOpen: true,
        data: data ?? null,
        lastUsedAt: Date.now(),
      };
    },

    closeOverlay: (state, action) => {
      const { overlayId, instanceId = DEFAULT_INSTANCE_ID } = action.payload;
      const bucket = state.overlays[overlayId];
      if (!bucket) return;
      const instance = bucket[instanceId];
      if (!instance) return;

      // Multi-instance entries have unique (non-default) ids. Dropping them
      // immediately on close avoids unbounded growth of closed records.
      // Singleton ("default") entries flip isOpen but retain the slot so
      // subsequent selectors keep their stable reference.
      if (instanceId !== DEFAULT_INSTANCE_ID) {
        delete bucket[instanceId];
        if (Object.keys(bucket).length === 0) {
          delete state.overlays[overlayId];
        }
        return;
      }
      instance.isOpen = false;
      instance.data = null;
    },

    closeAllOverlays: (state) => {
      for (const [overlayId, bucket] of Object.entries(state.overlays)) {
        for (const [instanceId, instance] of Object.entries(bucket)) {
          if (instanceId === DEFAULT_INSTANCE_ID) {
            instance.isOpen = false;
            instance.data = null;
          } else {
            delete bucket[instanceId];
          }
        }
        if (Object.keys(bucket).length === 0) {
          delete state.overlays[overlayId];
        }
      }
    },

    toggleOverlay: (state, action) => {
      const {
        overlayId,
        instanceId = DEFAULT_INSTANCE_ID,
        data,
      } = action.payload;
      if (!state.overlays[overlayId]) {
        state.overlays[overlayId] = {};
      }
      const existing = state.overlays[overlayId][instanceId];
      if (!existing) {
        state.overlays[overlayId][instanceId] = {
          isOpen: true,
          data: data ?? null,
          lastUsedAt: Date.now(),
        };
      } else if (existing.isOpen) {
        // Close branch — same semantics as closeOverlay.
        if (instanceId !== DEFAULT_INSTANCE_ID) {
          delete state.overlays[overlayId][instanceId];
          if (Object.keys(state.overlays[overlayId]).length === 0) {
            delete state.overlays[overlayId];
          }
        } else {
          existing.isOpen = false;
          existing.data = null;
        }
      } else {
        existing.isOpen = true;
        existing.data = data ?? existing.data;
        existing.lastUsedAt = Date.now();
      }
    },

    /**
     * Removes every instance of a given overlayId — useful when closing a
     * feature that opened many instanced overlays (e.g. closing an editor
     * that spawned multiple Content Editor tabs).
     */
    closeAllInstancesOfOverlay: (state, action) => {
      const { overlayId } = action.payload as { overlayId: string };
      delete state.overlays[overlayId];
    },

    /**
     * GC pass — removes closed instances last used more than
     * `olderThanMs` ago. Singleton slots are preserved regardless so the
     * selectors that return stable references don't thrash.
     *
     * Intended caller: idle sweep in WindowPersistenceManager (~30 min).
     */
    pruneStaleInstances: (state, action) => {
      const { olderThanMs } = action.payload as { olderThanMs: number };
      const cutoff = Date.now() - olderThanMs;
      for (const [overlayId, bucket] of Object.entries(state.overlays)) {
        for (const [instanceId, instance] of Object.entries(bucket)) {
          if (instanceId === DEFAULT_INSTANCE_ID) continue;
          if (instance.isOpen) continue;
          if (!instance.lastUsedAt || instance.lastUsedAt < cutoff) {
            delete bucket[instanceId];
          }
        }
        if (Object.keys(bucket).length === 0) {
          delete state.overlays[overlayId];
        }
      }
    },
  },
});

// ============================================================================
// SELECTORS
// ============================================================================

type StateWithOverlays = { overlays: OverlayState };

/** Stable fallback when an overlay instance has never been opened. */
const CLOSED_OVERLAY_INSTANCE: OverlayInstance = {
  isOpen: false,
  data: null,
};

/** Returns the instance record for a given overlay + instanceId. Falls back to closed/null. */
export const selectOverlay = (
  state: StateWithOverlays,
  overlayId: string,
  instanceId: string = DEFAULT_INSTANCE_ID,
): OverlayInstance =>
  state.overlays.overlays[overlayId]?.[instanceId] ?? CLOSED_OVERLAY_INSTANCE;

/** True when the given overlay instance is open. */
export const selectIsOverlayOpen = (
  state: StateWithOverlays,
  overlayId: string,
  instanceId: string = DEFAULT_INSTANCE_ID,
): boolean => selectOverlay(state, overlayId, instanceId).isOpen;

/** Data payload for the given overlay instance. */
export const selectOverlayData = (
  state: StateWithOverlays,
  overlayId: string,
  instanceId: string = DEFAULT_INSTANCE_ID,
): unknown => selectOverlay(state, overlayId, instanceId).data;

/**
 * Returns all currently-open instances for a given overlayId.
 * Used by OverlayController to render instanced overlays via .map().
 *
 * Memoized per overlayId so the returned array reference is stable when
 * the open-instances set has not changed, preventing unnecessary re-renders.
 */
const _openInstancesCache = new Map<
  string,
  (state: StateWithOverlays) => Array<{ instanceId: string; data: unknown }>
>();

export const selectOpenInstances = (
  state: StateWithOverlays,
  overlayId: string,
): Array<{ instanceId: string; data: unknown }> => {
  if (!_openInstancesCache.has(overlayId)) {
    _openInstancesCache.set(
      overlayId,
      createSelector(
        (s: StateWithOverlays) => s.overlays.overlays[overlayId],
        (instances) => {
          if (!instances) return EMPTY_INSTANCES;
          const result: Array<{ instanceId: string; data: unknown }> = [];
          for (const [instanceId, inst] of Object.entries(instances)) {
            if (inst.isOpen) result.push({ instanceId, data: inst.data });
          }
          return result.length === 0 ? EMPTY_INSTANCES : result;
        },
      ),
    );
  }
  return _openInstancesCache.get(overlayId)!(state);
};

// Stable empty array — returned when there are no open instances so callers
// that do `instances.length === 0` checks don't get a new reference each render.
const EMPTY_INSTANCES: Array<{ instanceId: string; data: unknown }> = [];

// ── Internal raw actions (untyped overlayId) ────────────────────────────────
// These come straight from createSlice and accept `overlayId: string`. We
// re-export them below wrapped to narrow `overlayId: OverlayId`. Callers
// should NEVER import these `_raw*` names — use the typed exports.
const _rawOpenOverlay = overlaySlice.actions.openOverlay;
const _rawCloseOverlay = overlaySlice.actions.closeOverlay;
const _rawToggleOverlay = overlaySlice.actions.toggleOverlay;
const _rawCloseAllInstances = overlaySlice.actions.closeAllInstancesOfOverlay;

// ── Public typed actions ────────────────────────────────────────────────────
// Single source of truth for opening/closing/toggling overlays. Every call
// site narrows `overlayId` to the registry-derived `OverlayId` union.

export const openOverlay = (payload: OpenOverlayPayload) =>
  _rawOpenOverlay(payload);

export const closeOverlay = (payload: CloseOverlayPayload) =>
  _rawCloseOverlay(payload);

export const toggleOverlay = (payload: ToggleOverlayPayload) =>
  _rawToggleOverlay(payload);

export const closeAllInstancesOfOverlay = (payload: CloseAllInstancesPayload) =>
  _rawCloseAllInstances(payload);

export const { closeAllOverlays, pruneStaleInstances } = overlaySlice.actions;
export default overlaySlice.reducer;
