/**
 * lib/redux/slices/recordingsSlice.ts
 *
 * Redux mirror of the GlobalRecordingProvider's runtime state.
 *
 * The provider is the single source of truth for the MediaRecorder lifecycle
 * — this slice is a read-only snapshot for non-React consumers, components
 * that don't have ergonomic access to the provider context, and devtools.
 * Writes happen exclusively from the provider via these reducers.
 *
 * Design constraints:
 *   - At most one recording at a time, app-wide. Concurrent recording is
 *     structurally impossible: there is ONE shared recorder behind the
 *     provider. A new `start()` follows "start-always-wins" — it takes over any
 *     in-flight recording rather than erroring. This slice never holds an array
 *     of concurrent recordings.
 *   - `audioLevel` updates ~60fps when recording. We don't subscribe to it
 *     from any list-rendering selectors; the pill reads it directly.
 */

import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

export type RecordingContext =
  | { kind: "studio"; sessionId: string }
  | { kind: "voice-pad"; instanceId: string }
  | { kind: "standalone"; label?: string }
  // A text-field surface (ProTextarea, ProInput, prompt/agent/notes inputs…)
  // driving the one shared recorder via `useVoiceCapture`. `instanceId`
  // identifies WHICH field currently owns the recorder so each field knows
  // whether the live transcript belongs to it; `label` is for the global
  // awareness indicator ("Recording — Agent message").
  | { kind: "field"; instanceId: string; label?: string };

export interface RecordingsState {
  isRecording: boolean;
  isPaused: boolean;
  isTranscribing: boolean;
  startedAtMs: number | null;
  durationSec: number;
  audioLevel: number;
  liveTranscript: string;
  failedChunkCount: number;
  context: RecordingContext | null;
  lastError: string | null;
}

const initialState: RecordingsState = {
  isRecording: false,
  isPaused: false,
  isTranscribing: false,
  startedAtMs: null,
  durationSec: 0,
  audioLevel: 0,
  liveTranscript: "",
  failedChunkCount: 0,
  context: null,
  lastError: null,
};

const slice = createSlice({
  name: "recordings",
  initialState,
  reducers: {
    recordingStarted(
      state,
      action: PayloadAction<{ context: RecordingContext; startedAtMs: number }>,
    ) {
      state.isRecording = true;
      state.isPaused = false;
      state.isTranscribing = false;
      state.startedAtMs = action.payload.startedAtMs;
      state.durationSec = 0;
      state.audioLevel = 0;
      state.liveTranscript = "";
      state.failedChunkCount = 0;
      state.context = action.payload.context;
      state.lastError = null;
    },
    recordingPaused(state) {
      state.isPaused = true;
      state.audioLevel = 0;
    },
    recordingResumed(state) {
      state.isPaused = false;
    },
    recordingStopped(state) {
      state.isRecording = false;
      state.isPaused = false;
      state.audioLevel = 0;
      // context lingers briefly while transcription wraps up so consumers can
      // identify which session just ended; cleared by recordingFinalized.
    },
    recordingFinalized(state) {
      state.isTranscribing = false;
      state.context = null;
      state.startedAtMs = null;
      state.durationSec = 0;
      state.liveTranscript = "";
      state.failedChunkCount = 0;
    },
    audioLevelChanged(state, action: PayloadAction<number>) {
      state.audioLevel = action.payload;
    },
    durationTicked(state, action: PayloadAction<number>) {
      state.durationSec = action.payload;
    },
    liveTranscriptUpdated(state, action: PayloadAction<string>) {
      state.liveTranscript = action.payload;
    },
    transcribingChanged(state, action: PayloadAction<boolean>) {
      state.isTranscribing = action.payload;
    },
    failedChunkCountChanged(state, action: PayloadAction<number>) {
      state.failedChunkCount = action.payload;
    },
    recordingErrored(state, action: PayloadAction<string>) {
      state.lastError = action.payload;
      state.isRecording = false;
      state.isPaused = false;
      state.isTranscribing = false;
      state.audioLevel = 0;
    },
  },
});

export const {
  recordingStarted,
  recordingPaused,
  recordingResumed,
  recordingStopped,
  recordingFinalized,
  audioLevelChanged,
  durationTicked,
  liveTranscriptUpdated,
  transcribingChanged,
  failedChunkCountChanged,
  recordingErrored,
} = slice.actions;

export default slice.reducer;
