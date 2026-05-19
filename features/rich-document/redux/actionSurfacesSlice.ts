// features/rich-document/redux/actionSurfacesSlice.ts
//
// Remote action-surface registry.
//
// Maps surfaceId → stack of registered RichDocument providers. The TOP of the
// stack wins; surfaces render the top provider's actions. The stack design
// fixes the "navigation order" bug where unmounting an older provider after
// the new one mounts would leave the surface empty (or worse, target stale
// content). See `features/rich-document/FEATURE.md` lifecycle invariants.
//
// IMPORTANT — what this slice does NOT store:
//   - Handlers (functions live in module scope, looked up by action id at render).
//   - Content strings or callbacks (held in refs by the registering component
//     and read live each render — never frozen in Redux).
//   - React elements.
//
// This keeps Redux state pure data, preserving the "no functions in Redux"
// doctrine and avoiding stale-snapshot bugs.

import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type {
  RichDocumentSurfaceRegistration,
  RichDocumentActionSpec,
} from "../types";

export interface ActionSurfacesState {
  /** surfaceId → ordered stack of providers (oldest first, newest at end). */
  bySurfaceId: Record<string, RichDocumentSurfaceRegistration[]>;
}

const initialState: ActionSurfacesState = {
  bySurfaceId: {},
};

const actionSurfacesSlice = createSlice({
  name: "richDocumentActionSurfaces",
  initialState,
  reducers: {
    /**
     * Push a provider onto a surface's stack. Idempotent by providerId — if
     * the same provider re-registers (e.g. StrictMode double-mount), the
     * existing entry is updated in-place rather than duplicated.
     */
    registerProvider(
      state,
      action: PayloadAction<{
        surfaceId: string;
        registration: RichDocumentSurfaceRegistration;
      }>,
    ) {
      const { surfaceId, registration } = action.payload;
      const stack = state.bySurfaceId[surfaceId] ?? [];
      const existingIdx = stack.findIndex(
        (entry) => entry.providerId === registration.providerId,
      );
      if (existingIdx >= 0) {
        stack[existingIdx] = registration;
      } else {
        stack.push(registration);
      }
      state.bySurfaceId[surfaceId] = stack;
    },

    /**
     * Update the action-spec snapshot for an already-registered provider.
     * Called when the provider's computed actions change (e.g. content
     * shape changes flip a `visible` predicate). Cheap; only touches one
     * stack entry.
     */
    updateProviderSpecs(
      state,
      action: PayloadAction<{
        surfaceId: string;
        providerId: string;
        computedActionSpecs: RichDocumentActionSpec[];
      }>,
    ) {
      const { surfaceId, providerId, computedActionSpecs } = action.payload;
      const stack = state.bySurfaceId[surfaceId];
      if (!stack) return;
      const idx = stack.findIndex((entry) => entry.providerId === providerId);
      if (idx < 0) return;
      stack[idx] = { ...stack[idx], computedActionSpecs };
    },

    /**
     * Remove a provider by ID. Splices out of the stack — order of remaining
     * providers preserved. Out-of-order navigation now keeps the right
     * provider on top even if older providers unmount later.
     */
    unregisterProvider(
      state,
      action: PayloadAction<{ surfaceId: string; providerId: string }>,
    ) {
      const { surfaceId, providerId } = action.payload;
      const stack = state.bySurfaceId[surfaceId];
      if (!stack) return;
      const next = stack.filter((entry) => entry.providerId !== providerId);
      if (next.length === 0) {
        delete state.bySurfaceId[surfaceId];
      } else {
        state.bySurfaceId[surfaceId] = next;
      }
    },

    /** Test/maintenance: clear everything. Not used in product code. */
    clearAll(state) {
      state.bySurfaceId = {};
    },
  },
});

export const {
  registerProvider,
  updateProviderSpecs,
  unregisterProvider,
  clearAll,
} = actionSurfacesSlice.actions;

export default actionSurfacesSlice.reducer;

// ============================================================================
// SELECTORS — each property has its own selector per CLAUDE.md doctrine.
// Memoization via reselect would be ideal but the surface count is tiny
// (<10 in practice), so simple selectors are sufficient and avoid the
// reselect indirection.
// ============================================================================

// Import RootState from rootReducer (not store) per the doctrine comment
// in lib/redux/rootReducer.ts — avoids store → rootReducer → slice → store cycle.
import type { RootState } from "@/lib/redux/rootReducer";

/** Returns the entire registration map. Prefer the per-surface selectors below. */
export const selectActionSurfacesState = (
  state: RootState,
): ActionSurfacesState => state.richDocumentActionSurfaces;

/** Returns the top-of-stack provider for a surfaceId, or null when empty. */
export const selectTopProvider = (
  state: RootState,
  surfaceId: string,
): RichDocumentSurfaceRegistration | null => {
  const stack = state.richDocumentActionSurfaces?.bySurfaceId[surfaceId];
  if (!stack || stack.length === 0) return null;
  return stack[stack.length - 1];
};

/** Returns the full stack for diagnostic purposes. */
export const selectProviderStack = (
  state: RootState,
  surfaceId: string,
): RichDocumentSurfaceRegistration[] =>
  state.richDocumentActionSurfaces?.bySurfaceId[surfaceId] ?? [];

/** Returns the action specs from the top-of-stack provider, or empty array. */
export const selectSurfaceActionSpecs = (
  state: RootState,
  surfaceId: string,
): RichDocumentActionSpec[] => {
  const top = selectTopProvider(state, surfaceId);
  return top?.computedActionSpecs ?? [];
};
