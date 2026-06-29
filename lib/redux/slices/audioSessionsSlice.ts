/**
 * lib/redux/slices/audioSessionsSlice.ts
 *
 * Redux mirror of the single app-wide `audioSessionRegistry`
 * (features/audio/session). The registry singleton is the source of truth for
 * EVERY audio activity in the session — playback (TTS read-aloud, the playback
 * queue, podcasts, the voice agent) AND recording (mic capture). This slice is a
 * read-only, serializable snapshot for the Audio window-panel and devtools.
 *
 * Writes happen exclusively from `AudioSessionHost`, which subscribes to the
 * registry and dispatches `audioSessionsSnapshotUpdated`. Control callbacks are
 * NOT here (functions aren't serializable) — they live in the registry's
 * side-table and are read directly via `getSessionControls`.
 */

import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { AudioSession } from "@/features/audio/session/types";

export interface AudioSessionsState {
  sessions: AudioSession[];
}

const initialState: AudioSessionsState = {
  sessions: [],
};

const slice = createSlice({
  name: "audioSessions",
  initialState,
  reducers: {
    audioSessionsSnapshotUpdated(
      state,
      action: PayloadAction<{ sessions: AudioSession[] }>,
    ) {
      state.sessions = action.payload.sessions;
    },
  },
});

export const { audioSessionsSnapshotUpdated } = slice.actions;
export default slice.reducer;
