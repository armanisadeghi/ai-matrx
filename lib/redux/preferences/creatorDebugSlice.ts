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
}

export interface CreatorDebugState {
  isCreatorMode: boolean;
  showCreatorTools: boolean;
  /** Per-feature visibility flags. Keys are namespaced: "Agents:RawState",
   *  "Shortcuts:JsonInspector", etc. Anything not present is treated as
   *  false. */
  visibility: Record<string, boolean>;
  settings: CreatorDebugSettings;
}

const initialState: CreatorDebugState = {
  isCreatorMode: false,
  showCreatorTools: false,
  visibility: {},
  settings: {
    showRawIds: false,
    showBuildAffordances: true,
    showDrafts: false,
  },
};

const creatorDebugSlice = createSlice({
  name: "creatorDebug",
  initialState,
  reducers: {
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

    resetCreatorState: () => initialState,
  },
});

export const {
  toggleCreatorMode,
  setCreatorMode,
  toggleCreatorTools,
  setCreatorTools,
  setVisibilityFlag,
  toggleVisibilityFlag,
  clearVisibilityFlag,
  setCreatorSetting,
  resetCreatorState,
} = creatorDebugSlice.actions;

export default creatorDebugSlice.reducer;

// ── Selectors ────────────────────────────────────────────────────────────

type WithCreatorDebug = { creatorDebug: CreatorDebugState };

export const selectIsCreatorMode = (state: WithCreatorDebug): boolean =>
  state.creatorDebug.isCreatorMode;

export const selectShowCreatorTools = (state: WithCreatorDebug): boolean =>
  state.creatorDebug.showCreatorTools;

export const selectCreatorVisibility = (state: WithCreatorDebug) =>
  state.creatorDebug.visibility;

export const selectCreatorVisibilityFlag =
  (key: string) =>
  (state: WithCreatorDebug): boolean =>
    state.creatorDebug.visibility[key] ?? false;

export const selectCreatorSettings = (
  state: WithCreatorDebug,
): CreatorDebugSettings => state.creatorDebug.settings;
