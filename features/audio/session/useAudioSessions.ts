/**
 * useAudioSessions — the stable client API for the unified audio registry.
 *
 * Reads the Redux mirror (so the panel re-renders on status changes) and routes
 * control calls to the registry's per-session control side-table. This is the
 * one hook the Audio panel uses to render and drive EVERY audio session, in or
 * out, regardless of which engine produced it.
 */

"use client";

import { useCallback } from "react";
import { useAppSelector } from "@/lib/redux/hooks";
import {
  selectAllAudioSessions,
  selectCurrentPlayback,
  selectCurrentRecording,
  selectIsPlaybackActive,
  selectPlaybackHistory,
  selectPlaybackPending,
  selectPlaybackSessions,
  selectRecordingHistory,
  selectRecordingSessions,
} from "./selectors";
import { getSessionControls } from "./audioSessionRegistry";
import type { AudioSessionControls } from "./types";

type ControlAction = keyof AudioSessionControls;

export function useAudioSessions() {
  const all = useAppSelector(selectAllAudioSessions);
  const playback = useAppSelector(selectPlaybackSessions);
  const currentPlayback = useAppSelector(selectCurrentPlayback);
  const isPlaybackActive = useAppSelector(selectIsPlaybackActive);
  const pending = useAppSelector(selectPlaybackPending);
  const playbackHistory = useAppSelector(selectPlaybackHistory);
  const recording = useAppSelector(selectRecordingSessions);
  const currentRecording = useAppSelector(selectCurrentRecording);
  const recordingHistory = useAppSelector(selectRecordingHistory);

  /** Invoke a control on a session (no-op if the session doesn't expose it). */
  const control = useCallback((id: string, action: ControlAction) => {
    const controls = getSessionControls(id);
    const fn = controls?.[action];
    if (fn) void fn();
  }, []);

  /** Whether a session currently exposes a given control. */
  const can = useCallback((id: string, action: ControlAction): boolean => {
    return !!getSessionControls(id)?.[action];
  }, []);

  return {
    all,
    playback,
    currentPlayback,
    isPlaybackActive,
    pending,
    playbackHistory,
    recording,
    currentRecording,
    recordingHistory,
    control,
    can,
  };
}
