/**
 * lib/redux/slices/audioPlaybackSlice.ts
 *
 * Redux mirror of the single app-wide `playbackQueue` (features/audio/playback).
 *
 * The queue singleton is the source of truth for the TTS/audio playback
 * lifecycle — this slice is a read-only snapshot for the window-panel UI,
 * Speaker buttons, and devtools. Writes happen exclusively from
 * `AudioPlaybackHost`, which subscribes to the queue and dispatches
 * `playbackSnapshotUpdated`. There is at most ONE active playback at a time;
 * additional requests are queued, never overlapped.
 */

import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { PlaybackItem } from "@/features/audio/playback/types";

export interface AudioPlaybackState {
  items: PlaybackItem[];
  currentId: string | null;
  rate: number;
}

const initialState: AudioPlaybackState = {
  items: [],
  currentId: null,
  rate: 1,
};

const slice = createSlice({
  name: "audioPlayback",
  initialState,
  reducers: {
    playbackSnapshotUpdated(
      state,
      action: PayloadAction<{
        items: PlaybackItem[];
        currentId: string | null;
        rate: number;
      }>,
    ) {
      state.items = action.payload.items;
      state.currentId = action.payload.currentId;
      state.rate = action.payload.rate;
    },
  },
});

export const { playbackSnapshotUpdated } = slice.actions;
export default slice.reducer;
