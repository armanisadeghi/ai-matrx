/**
 * Memoized selectors over the audioSessions slice (the audioSessionRegistry
 * mirror). Every selector is derived; the panel composes these into its three
 * synced lanes (Playback / Recording / Devices).
 */

import { createSelector } from "@reduxjs/toolkit";
import type { RootState } from "@/lib/redux/store";
import type { AudioSession } from "./types";

const selectAudioSessionsState = (state: RootState) => state.audioSessions;

/** All sessions, oldest → newest (stable order via createdAtMs). */
export const selectAllAudioSessions = createSelector(
  selectAudioSessionsState,
  (s): AudioSession[] =>
    [...s.sessions].sort((a, b) => a.createdAtMs - b.createdAtMs),
);

const isActiveStatus = (s: AudioSession) =>
  s.status === "loading" || s.status === "active" || s.status === "paused";

// ─── Playback lane ────────────────────────────────────────────────────────────

export const selectPlaybackSessions = createSelector(
  selectAllAudioSessions,
  (all): AudioSession[] => all.filter((s) => s.direction === "playback"),
);

/** The one playback session currently loading/playing/paused, if any. */
export const selectCurrentPlayback = createSelector(
  selectPlaybackSessions,
  (list): AudioSession | null => {
    // Newest active wins (start-always-wins matches the playback lock).
    for (let i = list.length - 1; i >= 0; i--) {
      if (isActiveStatus(list[i])) return list[i];
    }
    return null;
  },
);

export const selectIsPlaybackActive = createSelector(
  selectCurrentPlayback,
  (cur): boolean => cur !== null,
);

/** Queued-but-not-yet-playing items (the playback queue's "up next"). */
export const selectPlaybackPending = createSelector(
  selectPlaybackSessions,
  (list): AudioSession[] => list.filter((s) => s.status === "queued"),
);

/** Finished/errored playback, newest first — the replayable history. */
export const selectPlaybackHistory = createSelector(
  selectPlaybackSessions,
  (list): AudioSession[] =>
    list
      .filter((s) => s.status === "done" || s.status === "error")
      .sort((a, b) => (b.endedAtMs ?? b.createdAtMs) - (a.endedAtMs ?? a.createdAtMs)),
);

// ─── Recording lane ───────────────────────────────────────────────────────────

export const selectRecordingSessions = createSelector(
  selectAllAudioSessions,
  (all): AudioSession[] => all.filter((s) => s.direction === "recording"),
);

export const selectCurrentRecording = createSelector(
  selectRecordingSessions,
  (list): AudioSession | null => {
    for (let i = list.length - 1; i >= 0; i--) {
      if (isActiveStatus(list[i])) return list[i];
    }
    return null;
  },
);

export const selectRecordingHistory = createSelector(
  selectRecordingSessions,
  (list): AudioSession[] =>
    list
      .filter((s) => s.status === "done" || s.status === "error")
      .sort((a, b) => (b.endedAtMs ?? b.createdAtMs) - (a.endedAtMs ?? a.createdAtMs)),
);
