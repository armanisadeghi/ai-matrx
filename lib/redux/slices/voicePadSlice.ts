// lib/redux/slices/voicePadSlice.ts
//
// Per-instance voice-pad state. One slice serves all surfaces that share
// the voice-pad slice machinery ("voicePad" | "voicePadAdvanced" |
// "transcriptionCleanup" overlays + the "transcriptionCleanupPage" route),
// keyed by `${overlayId}:${instanceId}` so multiple surfaces AND multiple
// instances of each can coexist without collision.

import {
  createSelector,
  createSlice,
  type PayloadAction,
} from "@reduxjs/toolkit";

export type VoicePadVariant =
  | "voicePad"
  | "voicePadAdvanced"
  | "transcriptionCleanup"
  | "transcriptionCleanupPage";

/**
 * The subset of variants that are real OVERLAYS (registered overlay ids).
 * "transcriptionCleanupPage" is a route, not an overlay — overlay helpers
 * (useVoicePad / open-voice-pad) must use this narrower union.
 */
export type VoicePadOverlayVariant = Exclude<
  VoicePadVariant,
  "transcriptionCleanupPage"
>;

interface TranscriptEntry {
  id: string;
  text: string;
  timestamp: number;
}

export interface VoicePadInstance {
  entries: TranscriptEntry[];
  /**
   * null = no draft; textarea renders `entries` joined.
   * string (including "") = user has started editing; textarea renders the draft verbatim.
   * This distinction matters: deleting every character must leave an empty textarea,
   * not silently fall back to the entry-joined text.
   */
  draftText: string | null;
}

export interface VoicePadState {
  instances: Record<string, VoicePadInstance>;
}

const initialState: VoicePadState = {
  instances: {},
};

const EMPTY_INSTANCE: VoicePadInstance = { entries: [], draftText: null };

export function voicePadKey(
  overlayId: VoicePadVariant,
  instanceId: string,
): string {
  return `${overlayId}:${instanceId}`;
}

function getOrInit(state: VoicePadState, key: string): VoicePadInstance {
  if (!state.instances[key]) {
    state.instances[key] = { entries: [], draftText: null };
  }
  return state.instances[key];
}

interface InstancePayload {
  overlayId: VoicePadVariant;
  instanceId: string;
}

const voicePadSlice = createSlice({
  name: "voicePad",
  initialState,
  reducers: {
    addTranscriptEntry(
      state,
      action: PayloadAction<InstancePayload & { text: string }>,
    ) {
      const { overlayId, instanceId, text } = action.payload;
      const inst = getOrInit(state, voicePadKey(overlayId, instanceId));
      inst.entries.push({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        text,
        timestamp: Date.now(),
      });
    },
    removeTranscriptEntry(
      state,
      action: PayloadAction<InstancePayload & { entryId: string }>,
    ) {
      const { overlayId, instanceId, entryId } = action.payload;
      const inst = state.instances[voicePadKey(overlayId, instanceId)];
      if (!inst) return;
      inst.entries = inst.entries.filter((e) => e.id !== entryId);
    },
    clearAllEntries(state, action: PayloadAction<InstancePayload>) {
      const { overlayId, instanceId } = action.payload;
      const inst = state.instances[voicePadKey(overlayId, instanceId)];
      if (!inst) return;
      inst.entries = [];
      inst.draftText = null;
    },
    startNewSession(state, action: PayloadAction<InstancePayload>) {
      const { overlayId, instanceId } = action.payload;
      const inst = state.instances[voicePadKey(overlayId, instanceId)];
      if (!inst) return;
      inst.entries = [];
      inst.draftText = null;
    },
    setDraftText(
      state,
      action: PayloadAction<InstancePayload & { text: string | null }>,
    ) {
      const { overlayId, instanceId, text } = action.payload;
      getOrInit(state, voicePadKey(overlayId, instanceId)).draftText = text;
    },
    disposeInstance(state, action: PayloadAction<InstancePayload>) {
      const { overlayId, instanceId } = action.payload;
      delete state.instances[voicePadKey(overlayId, instanceId)];
    },
  },
});

export const {
  addTranscriptEntry,
  removeTranscriptEntry,
  clearAllEntries,
  startNewSession,
  setDraftText,
  disposeInstance,
} = voicePadSlice.actions;

type StateWithVoicePad = { voicePad: VoicePadState };

const selectInstance = (
  state: StateWithVoicePad,
  overlayId: VoicePadVariant,
  instanceId: string,
): VoicePadInstance =>
  state.voicePad.instances[voicePadKey(overlayId, instanceId)] ??
  EMPTY_INSTANCE;

export const selectVoicePadEntries = (
  state: StateWithVoicePad,
  overlayId: VoicePadVariant,
  instanceId: string,
) => selectInstance(state, overlayId, instanceId).entries;

export const selectVoicePadDraftText = (
  state: StateWithVoicePad,
  overlayId: VoicePadVariant,
  instanceId: string,
) => selectInstance(state, overlayId, instanceId).draftText;

/** Memoized per-key selector factory for combined text. */
const _allTextCache = new Map<string, (state: StateWithVoicePad) => string>();

export const selectVoicePadAllText = (
  state: StateWithVoicePad,
  overlayId: VoicePadVariant,
  instanceId: string,
): string => {
  const key = voicePadKey(overlayId, instanceId);
  if (!_allTextCache.has(key)) {
    _allTextCache.set(
      key,
      createSelector(
        [
          (s: StateWithVoicePad) =>
            selectInstance(s, overlayId, instanceId).entries,
          (s: StateWithVoicePad) =>
            selectInstance(s, overlayId, instanceId).draftText,
        ],
        (entries, draft): string => {
          if (draft !== null) return draft;
          return entries.map((e) => e.text).join("\n\n");
        },
      ),
    );
  }
  return _allTextCache.get(key)!(state);
};

export default voicePadSlice.reducer;
