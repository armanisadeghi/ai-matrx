/**
 * surfaces slice — central registry for UI consumers of the agent system.
 *
 * Each consumer (a page, floating window, modal, widget) registers itself
 * once on mount with a stable `surfaceKey` and a `kind`. Action bars and
 * other shared components then dispatch surface-agnostic intents (e.g.
 * "navigate to this conversation"); the routing thunk reads the registry
 * to produce the right kind of state update for that surface kind.
 *
 * Why this exists:
 *   • Action bars (fork / edit / delete / retry) live inside reusable
 *     components but their "success" looks different per consumer. A page
 *     needs to update its URL; a floating window just changes its own
 *     state; a widget might do nothing or pop the user to the full runner.
 *   • Consumers used to each write their own focus-watching effect with
 *     ad-hoc routing logic. With this registry, every page consumer uses
 *     the same 5-line pendingNavigation effect, and window/widget consumers
 *     don't need any extra effect at all.
 *
 * Contract:
 *   • `kind === 'page'`  — the routing thunk writes pendingNavigation; the
 *                          consumer's effect reads it, calls router.replace,
 *                          and clears it.
 *   • `kind === 'window'` or `'widget'` — the routing thunk dispatches
 *                          conversation-focus `setFocus` directly. The
 *                          consumer is already reactive to focus changes;
 *                          no consumer effect is required.
 *
 * The slice itself is stateless w.r.t. routing — it just stores the
 * registration and the pending-navigation slot. The thunk in
 * request-surface-navigation.thunk.ts owns the dispatch logic.
 */

import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

// =============================================================================
// Types
// =============================================================================

export type SurfaceKind = "page" | "window" | "widget";

export type SurfaceNavigationReason = "fork" | "load" | "retry" | "manual";

export interface SurfaceRegistration {
  surfaceKey: string;
  kind: SurfaceKind;
  /**
   * For `page` consumers — the base path, e.g. `/agents/[agentId]/run`.
   * The page consumer's effect resolves this against current Next.js
   * params and calls `router.replace(...)`. Optional for window/widget.
   */
  basePath?: string;
  /**
   * When `true`, the routing thunk writes `pendingNavigation` for this
   * surface regardless of `kind` instead of dispatching `setFocus`. Use
   * for `window` / `widget` consumers that need to react to navigation
   * intents with something more involved than a focus change — e.g. the
   * chat-assistant widget spawns a sibling overlay for the target
   * conversation rather than re-keying itself.
   */
  customNavigation?: boolean;
}

export interface PendingNavigation {
  conversationId: string;
  reason: SurfaceNavigationReason;
}

export interface SurfacesState {
  byKey: Record<string, SurfaceRegistration>;
  pendingNavigation: Record<string, PendingNavigation | undefined>;
}

const initialState: SurfacesState = {
  byKey: {},
  pendingNavigation: {},
};

// =============================================================================
// Slice
// =============================================================================

const surfacesSlice = createSlice({
  name: "surfaces",
  initialState,
  reducers: {
    registerSurface(state, action: PayloadAction<SurfaceRegistration>) {
      const reg = action.payload;
      state.byKey[reg.surfaceKey] = reg;
    },

    unregisterSurface(state, action: PayloadAction<string>) {
      delete state.byKey[action.payload];
      delete state.pendingNavigation[action.payload];
    },

    setPendingNavigation(
      state,
      action: PayloadAction<{
        surfaceKey: string;
        conversationId: string;
        reason: SurfaceNavigationReason;
      }>,
    ) {
      const { surfaceKey, conversationId, reason } = action.payload;
      state.pendingNavigation[surfaceKey] = { conversationId, reason };
    },

    clearPendingNavigation(
      state,
      action: PayloadAction<{ surfaceKey: string }>,
    ) {
      delete state.pendingNavigation[action.payload.surfaceKey];
    },
  },
});

export const {
  registerSurface,
  unregisterSurface,
  setPendingNavigation,
  clearPendingNavigation,
} = surfacesSlice.actions;

export const surfacesReducer = surfacesSlice.reducer;
export default surfacesSlice.reducer;

// =============================================================================
// Selectors
// =============================================================================

type WithSurfaces = { surfaces: SurfacesState };

export const selectSurfaceRegistration =
  (surfaceKey: string) =>
  (state: WithSurfaces): SurfaceRegistration | undefined =>
    state.surfaces?.byKey?.[surfaceKey];

export const selectPendingNavigation =
  (surfaceKey: string) =>
  (state: WithSurfaces): PendingNavigation | undefined =>
    state.surfaces?.pendingNavigation?.[surfaceKey];
