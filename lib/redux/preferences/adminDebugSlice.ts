// lib/redux/slices/adminDebugSlice.ts
//
// Central Redux slice for the admin debug system.
//
// Three independent data stores:
//
//   1. routeContext  — auto-captured by AdminDebugContextCollector (layout-level).
//                     Never write here manually. Read to include in "Copy Context".
//
//   2. debugData     — namespaced key/value store for any route or feature to write
//                     into. Keys are namespaced: "Chat:Session ID", "API:Last Request".
//                     Read by LargeIndicator for the JSON debug panel.
//
//   3. consoleErrors — ring buffer (max 30) of captured console.error/unhandledrejection
//                     calls. Captured by AdminDebugContextCollector. Read-only for
//                     consumers.
//
// Indicators (promptDebug, resourceDebug, executionStateDebug) are unchanged from
// the original design — they drive the floating debug panels in DebugIndicatorManager.

import { createSelector, createSlice, PayloadAction } from "@reduxjs/toolkit";
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

export interface ConsoleErrorEntry {
  id: string;
  message: string;
  source: "console.error" | "unhandledrejection" | "error-event";
  stack?: string;
  capturedAt: number; // epoch ms
}

export interface AdminDebugState {
  isDebugMode: boolean;

  // Auto-captured by AdminDebugContextCollector — never write manually
  routeContext: RouteContext | null;

  // Ring buffer of captured console errors — max 30
  consoleErrors: ConsoleErrorEntry[];

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

const MAX_CONSOLE_ERRORS = 30;

const initialState: AdminDebugState = {
  isDebugMode: false,
  routeContext: null,
  consoleErrors: [],
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

    // ── Console errors ───────────────────────────────────────────────────

    appendConsoleError: (state, action: PayloadAction<ConsoleErrorEntry>) => {
      state.consoleErrors.unshift(action.payload);
      if (state.consoleErrors.length > MAX_CONSOLE_ERRORS) {
        state.consoleErrors.length = MAX_CONSOLE_ERRORS;
      }
    },
    clearConsoleErrors: (state) => {
      state.consoleErrors = [];
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
  appendConsoleError,
  clearConsoleErrors,
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

// Raw slice accessors — used as inputs to derived selectors
const selectAdminDebugSlice = (state: WithAdminDebug) => state.adminDebug;
const selectIndicators = (state: WithAdminDebug) => state.adminDebug.indicators;

type WithAdminDebug = { adminDebug: AdminDebugState };

export const selectIsDebugMode = (state: WithAdminDebug) =>
  state.adminDebug.isDebugMode;
export const selectRouteContext = (state: WithAdminDebug) =>
  state.adminDebug.routeContext;
export const selectConsoleErrors = (state: WithAdminDebug) =>
  state.adminDebug.consoleErrors;
export const selectDebugData = (state: WithAdminDebug) => state.adminDebug.debugData;
export const selectDebugKey = (key: string) => (state: WithAdminDebug) =>
  state.adminDebug.debugData[key];

/** Full slice snapshot — only use for the "Copy Context" serialization path, not in reactive components. */
export const selectAdminDebug = selectAdminDebugSlice;

/** All indicator sub-objects — direct reference; stable unless an indicator changes. */
export const selectDebugIndicators = selectIndicators;

export const selectPromptDebugIndicator = (state: WithAdminDebug) =>
  state.adminDebug.indicators.promptDebug;
export const selectResourceDebugIndicator = (state: WithAdminDebug) =>
  state.adminDebug.indicators.resourceDebug;
export const selectExecutionStateDebug = (state: WithAdminDebug) =>
  state.adminDebug.indicators.executionStateDebug;

export default adminDebugSlice.reducer;
