// lib/redux/preferences/creatorDebugSlice.ts
//
// Redux slice for the "creator" role — agentic engineers building agents,
// shortcuts, content blocks, etc. Creators are a tier below admins; most
// will eventually also be admins, but the concerns are distinct.
//
// Parallel in shape to adminDebugSlice, but scoped to creator-mode chrome:
//   - isCreatorMode      — master toggle; gates every creator-only surface
//   - showCreatorTools   — visibility flag for in-page creator affordances
//                          (build buttons, draft pickers, raw-state insets)
//   - visibility         — per-feature visibility map (string keys, bool
//                          values) so individual surfaces can opt in/out
//                          without growing this slice every time a new
//                          creator widget appears
//   - settings           — small typed settings bag for the rare actual
//                          preferences creators have that differ from
//                          regular users
//   - debugData          — namespaced key/value store ("Namespace:Label")
//                          any feature can drop arbitrary debug data into
//                          without its own slice. Rendered by the Creator
//                          Hub "Data" tab. Mirrors adminDebugSlice.debugData.
//
// Authority (is-this-user-a-creator) lives in userAuth — never duplicate
// it here. This slice is purely "what does the current creator want to see
// right now."

import { createSlice, PayloadAction } from "@reduxjs/toolkit";

export interface CreatorDebugSettings {
  /** Show raw IDs (agent, shortcut, conversation, etc.) inline next to
   *  display names. Most creators want this; most users do not. */
  showRawIds: boolean;
  /** Show "build" / "edit definition" affordances on agent surfaces. */
  showBuildAffordances: boolean;
  /** Show draft/unpublished entities mixed in with published ones in
   *  listing surfaces. */
  showDrafts: boolean;
  /** Emergency brake for surface-driven tool injection. When true,
   *  `buildToolInjection` declares NO `client.surface` (and skips the
   *  sandbox-fs client stopgap), so the server's surface resolver never runs
   *  and no surface/default tools are auto-attached — the agent runs with only
   *  its own saved tools. Global: applies to every agent and every run. This
   *  is the frontend stopgap for the `matrx-default/default` inheritance that
   *  currently injects the eight UI-first tools into every matrx-user surface.
   *  Off by default. */
  disableToolInjection: boolean;
}

export interface CreatorDebugState {
  /**
   * Authority flag — TRUE only when we are CERTAIN the current user owns the
   * agent currently in context. Set by useCreatorOwnershipSync on agent
   * build/run/chat/apps pages; defaults false and is aggressively cleared on
   * navigation / when ownership is uncertain. This is what `selectIsCreator`
   * (userSelectors) reads. Distinct from `isCreatorMode`, the creator's manual
   * "show creator UI" toggle.
   */
  isCreator: boolean;
  isCreatorMode: boolean;
  showCreatorTools: boolean;
  /** Show the inline Creator Run Panel above the agent input. Default false;
   *  toggled from the Creator Hub Settings tab or the admin indicator. */
  showCreatorPanel: boolean;
  /** Per-feature visibility flags. Keys are namespaced: "Agents:RawState",
   *  "Shortcuts:JsonInspector", etc. Anything not present is treated as
   *  false. */
  visibility: Record<string, boolean>;
  /** Namespaced key/value store ("Namespace:Label"). Any feature can drop
   *  arbitrary debug data here via setCreatorDebugKey without its own slice;
   *  rendered by the Creator Hub "Data" tab. Parallels adminDebugSlice. */
  debugData: Record<string, unknown>;
  settings: CreatorDebugSettings;
}

const initialState: CreatorDebugState = {
  isCreator: false,
  isCreatorMode: false,
  showCreatorTools: false,
  showCreatorPanel: false,
  visibility: {},
  debugData: {},
  settings: {
    showRawIds: false,
    showBuildAffordances: true,
    showDrafts: false,
    disableToolInjection: false,
  },
};

const creatorDebugSlice = createSlice({
  name: "creatorDebug",
  initialState,
  reducers: {
    // Authority flag — set by useCreatorOwnershipSync only (never toggled by UI).
    setIsCreator: (state, action: PayloadAction<boolean>) => {
      state.isCreator = action.payload;
    },

    toggleCreatorMode: (state) => {
      state.isCreatorMode = !state.isCreatorMode;
    },
    setCreatorMode: (state, action: PayloadAction<boolean>) => {
      state.isCreatorMode = action.payload;
    },

    toggleCreatorTools: (state) => {
      state.showCreatorTools = !state.showCreatorTools;
    },
    setCreatorTools: (state, action: PayloadAction<boolean>) => {
      state.showCreatorTools = action.payload;
    },

    toggleShowCreatorPanel: (state) => {
      state.showCreatorPanel = !state.showCreatorPanel;
    },
    setShowCreatorPanel: (state, action: PayloadAction<boolean>) => {
      state.showCreatorPanel = action.payload;
    },

    setVisibilityFlag: (
      state,
      action: PayloadAction<{ key: string; value: boolean }>,
    ) => {
      state.visibility[action.payload.key] = action.payload.value;
    },
    toggleVisibilityFlag: (state, action: PayloadAction<string>) => {
      state.visibility[action.payload] = !state.visibility[action.payload];
    },
    clearVisibilityFlag: (state, action: PayloadAction<string>) => {
      delete state.visibility[action.payload];
    },

    setCreatorSetting: <K extends keyof CreatorDebugSettings>(
      state: CreatorDebugState,
      action: PayloadAction<{ key: K; value: CreatorDebugSettings[K] }>,
    ) => {
      state.settings[action.payload.key] = action.payload.value;
    },

    // ── Debug data (namespaced key/value; mirrors adminDebugSlice) ────────

    // Merge key/value pairs — use namespaced keys: "Agents:Last Run"
    updateCreatorDebugData: (
      state,
      action: PayloadAction<Record<string, unknown>>,
    ) => {
      state.debugData = { ...state.debugData, ...action.payload };
    },
    // Replace ALL debug data
    setCreatorDebugData: (
      state,
      action: PayloadAction<Record<string, unknown>>,
    ) => {
      state.debugData = action.payload;
    },
    // Set a single key
    setCreatorDebugKey: (
      state,
      action: PayloadAction<{ key: string; value: unknown }>,
    ) => {
      state.debugData[action.payload.key] = action.payload.value;
    },
    // Remove a single key
    removeCreatorDebugKey: (state, action: PayloadAction<string>) => {
      delete state.debugData[action.payload];
    },
    // Remove all keys for a namespace prefix — call on component unmount
    clearCreatorDebugNamespace: (state, action: PayloadAction<string>) => {
      const prefix = action.payload + ":";
      for (const key of Object.keys(state.debugData)) {
        if (key.startsWith(prefix)) {
          delete state.debugData[key];
        }
      }
    },
    // Clear all debug data
    clearCreatorDebugData: (state) => {
      state.debugData = {};
    },

    // Preserve the ownership authority flag — it's derived from the agent in
    // context, not a user preference, so a settings reset shouldn't drop it.
    resetCreatorState: (state) => ({
      ...initialState,
      isCreator: state.isCreator,
    }),
  },
});

export const {
  setIsCreator,
  toggleCreatorMode,
  setCreatorMode,
  toggleCreatorTools,
  setCreatorTools,
  toggleShowCreatorPanel,
  setShowCreatorPanel,
  setVisibilityFlag,
  toggleVisibilityFlag,
  clearVisibilityFlag,
  setCreatorSetting,
  updateCreatorDebugData,
  setCreatorDebugData,
  setCreatorDebugKey,
  removeCreatorDebugKey,
  clearCreatorDebugNamespace,
  clearCreatorDebugData,
  resetCreatorState,
} = creatorDebugSlice.actions;

export default creatorDebugSlice.reducer;

// ── Selectors ────────────────────────────────────────────────────────────

type WithCreatorDebug = { creatorDebug: CreatorDebugState };

export const selectIsCreatorMode = (state: WithCreatorDebug): boolean =>
  state.creatorDebug.isCreatorMode;

export const selectShowCreatorTools = (state: WithCreatorDebug): boolean =>
  state.creatorDebug.showCreatorTools;

export const selectShowCreatorPanel = (state: WithCreatorDebug): boolean =>
  state.creatorDebug.showCreatorPanel;

export const selectCreatorVisibility = (state: WithCreatorDebug) =>
  state.creatorDebug.visibility;

export const selectCreatorVisibilityFlag =
  (key: string) =>
  (state: WithCreatorDebug): boolean =>
    state.creatorDebug.visibility[key] ?? false;

export const selectCreatorSettings = (
  state: WithCreatorDebug,
): CreatorDebugSettings => state.creatorDebug.settings;

export const selectCreatorDebugData = (
  state: WithCreatorDebug,
): Record<string, unknown> => state.creatorDebug.debugData;

export const selectCreatorDebugKey =
  (key: string) =>
  (state: WithCreatorDebug): unknown =>
    state.creatorDebug.debugData[key];
