// lib/redux/slices/adminDebugSlice.ts
//
// Central Redux slice for the admin debug system.
//
// Two independent data stores:
//
//   1. routeContext  — auto-captured by AdminDebugContextCollector (layout-level).
//                     Never write here manually. Read to include in "Copy Context".
//
//   2. debugData     — namespaced key/value store for any route or feature to write
//                     into. Keys are namespaced: "Chat:Session ID", "API:Last Request".
//                     Read by LargeIndicator for the JSON debug panel.
//
// Captured console / runtime errors live in the systemwide module store
// (lib/diagnostics/errorCaptureStore) now — NOT here. LargeIndicator reads them
// from that store via useCapturedErrors. The old `consoleErrors` ring buffer +
// listeners were retired to avoid a parallel capture system.
//
// Indicators (promptDebug, resourceDebug, executionStateDebug) are unchanged from
// the original design — they drive the floating debug panels in DebugIndicatorManager.

import { createSelector, createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { DebugData } from "@/components/debug/SystemPromptDebugModal";

// ============================================================================
// TYPES
// ============================================================================

export interface RouteContext {
  pathname: string;
  searchParams: Record<string, string>;
  capturedAt: number; // epoch ms
  userAgent: string;
  viewportWidth: number;
  viewportHeight: number;
  renderCount: number; // increments each time pathname changes
}

export interface AdminDebugState {
  isDebugMode: boolean;

  // Auto-captured by AdminDebugContextCollector — never write manually
  routeContext: RouteContext | null;

  // Namespaced key/value store — keys should be "Namespace:Label"
  // e.g. "Chat:Session ID", "API:Backend URL"
  debugData: Record<string, unknown>;

  // Floating debug panel indicators (unchanged from original design)
  indicators: {
    promptDebug?: { isOpen: boolean; data: DebugData | null };
    resourceDebug?: { isOpen: boolean; runId: string };
    executionStateDebug?: { isOpen: boolean; runId: string };
  };
}

const initialState: AdminDebugState = {
  isDebugMode: false,
  routeContext: null,
  debugData: {},
  indicators: {},
};

// ============================================================================
// SLICE
// ============================================================================

const adminDebugSlice = createSlice({
  name: "adminDebug",
  initialState,
  reducers: {
    // ── Debug mode ──────────────────────────────────────────────────────

    toggleDebugMode: (state) => {
      state.isDebugMode = !state.isDebugMode;
    },
    setDebugMode: (state, action: PayloadAction<boolean>) => {
      state.isDebugMode = action.payload;
    },

    // ── Route context (written by AdminDebugContextCollector only) ───────

    setRouteContext: (state, action: PayloadAction<RouteContext>) => {
      state.routeContext = action.payload;
    },

    // ── Debug data (namespaced key/value) ────────────────────────────────

    // Merge key/value pairs — use namespaced keys: "Chat:Session ID"
    updateDebugData: (
      state,
      action: PayloadAction<Record<string, unknown>>,
    ) => {
      state.debugData = { ...state.debugData, ...action.payload };
    },

    // Replace ALL debug data
    setDebugData: (state, action: PayloadAction<Record<string, unknown>>) => {
      state.debugData = action.payload;
    },

    // Set a single key
    setDebugKey: (
      state,
      action: PayloadAction<{ key: string; value: unknown }>,
    ) => {
      state.debugData[action.payload.key] = action.payload.value;
    },

    // Remove a single key
    removeDebugKey: (state, action: PayloadAction<string>) => {
      delete state.debugData[action.payload];
    },

    // Remove all keys for a namespace prefix — call on component unmount
    // e.g. clearDebugNamespace('Chat') removes all "Chat:*" keys
    clearDebugNamespace: (state, action: PayloadAction<string>) => {
      const prefix = action.payload + ":";
      for (const key of Object.keys(state.debugData)) {
        if (key.startsWith(prefix)) {
          delete state.debugData[key];
        }
      }
    },

    // Clear all debug data
    clearDebugData: (state) => {
      state.debugData = {};
    },

    // Reset everything
    resetDebugState: () => initialState,

    // ── Indicator management (unchanged) ─────────────────────────────────

    showPromptDebugIndicator: (
      state,
      action: PayloadAction<DebugData | null>,
    ) => {
      state.indicators.promptDebug = { isOpen: true, data: action.payload };
    },
    hidePromptDebugIndicator: (state) => {
      state.indicators.promptDebug = undefined;
    },
    showResourceDebugIndicator: (
      state,
      action: PayloadAction<{ runId: string }>,
    ) => {
      state.indicators.resourceDebug = {
        isOpen: true,
        runId: action.payload.runId,
      };
    },
    hideResourceDebugIndicator: (state) => {
      state.indicators.resourceDebug = undefined;
    },
    showExecutionStateDebug: (
      state,
      action: PayloadAction<{ runId: string }>,
    ) => {
      state.indicators.executionStateDebug = {
        isOpen: true,
        runId: action.payload.runId,
      };
    },
    hideExecutionStateDebug: (state) => {
      state.indicators.executionStateDebug = undefined;
    },
  },
});

// ============================================================================
// EXPORTS
// ============================================================================

export const {
  toggleDebugMode,
  setDebugMode,
  setRouteContext,
  updateDebugData,
  setDebugData,
  setDebugKey,
  removeDebugKey,
  clearDebugNamespace,
  clearDebugData,
  resetDebugState,
  showPromptDebugIndicator,
  hidePromptDebugIndicator,
  showResourceDebugIndicator,
  hideResourceDebugIndicator,
  showExecutionStateDebug,
  hideExecutionStateDebug,
} = adminDebugSlice.actions;

// ── Selectors ────────────────────────────────────────────────────────────────

// Raw slice accessors — used as inputs to derived selectors.
//
// The slice is optional on purpose: debug publishing (useDebugContext) now runs
// inside shared components like the Share dialog, and any store that is not the
// app's root store (a test harness, an embedded surface, a package host) may not
// mount `adminDebug`. Reading debug state must never crash the component that
// merely offers it — an absent slice reads as the slice's declared initial
// state (debug mode off, no data), and says so once outside production.
type WithAdminDebug = { adminDebug?: AdminDebugState };

let warnedAbsentSlice = false;
const selectAdminDebugSlice = (state: WithAdminDebug): AdminDebugState => {
  const slice = state.adminDebug;
  if (slice) return slice;
  if (!warnedAbsentSlice && process.env.NODE_ENV !== "production") {
    warnedAbsentSlice = true;
    console.warn(
      "[adminDebug] store has no `adminDebug` slice — debug selectors read the " +
        "initial state (debug mode off). Remedy: mount adminDebugReducer under " +
        "`adminDebug` if this store should publish admin debug context.",
    );
  }
  return initialState;
};
const selectIndicators = (state: WithAdminDebug) =>
  selectAdminDebugSlice(state).indicators;

export const selectIsDebugMode = (state: WithAdminDebug) =>
  selectAdminDebugSlice(state).isDebugMode;
export const selectRouteContext = (state: WithAdminDebug) =>
  selectAdminDebugSlice(state).routeContext;
export const selectDebugData = (state: WithAdminDebug) =>
  selectAdminDebugSlice(state).debugData;
export const selectDebugKey = (key: string) => (state: WithAdminDebug) =>
  selectAdminDebugSlice(state).debugData[key];

/** Full slice snapshot — only use for the "Copy Context" serialization path, not in reactive components. */
export const selectAdminDebug = selectAdminDebugSlice;

/** All indicator sub-objects — direct reference; stable unless an indicator changes. */
export const selectDebugIndicators = selectIndicators;

export const selectPromptDebugIndicator = (state: WithAdminDebug) =>
  selectIndicators(state).promptDebug;
export const selectResourceDebugIndicator = (state: WithAdminDebug) =>
  selectIndicators(state).resourceDebug;
export const selectExecutionStateDebug = (state: WithAdminDebug) =>
  selectIndicators(state).executionStateDebug;

export default adminDebugSlice.reducer;
