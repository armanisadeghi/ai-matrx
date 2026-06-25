/**
 * useAudioPlayback — the stable client API for the single playback queue.
 *
 * Reads the Redux mirror for render state and forwards control calls to the
 * `playbackQueue` singleton. Use this everywhere a surface needs to speak text
 * or drive the global queue (Speaker buttons, the window-panel controls, etc.).
 */

"use client";

import { useCallback } from "react";
import { useAppSelector } from "@/lib/redux/hooks";
import {
  clearPlayback,
  enqueuePlayback,
  pausePlayback,
  playPlaybackItem,
  removePlaybackItem,
  resumePlayback,
  setPlaybackRate,
  skipPlayback,
} from "./playbackQueue";
import {
  selectIsPlaybackActive,
  selectPlaybackCurrentId,
  selectPlaybackCurrentItem,
  selectPlaybackItems,
  selectPlaybackPending,
  selectPlaybackRate,
} from "./selectors";
import type { PlaybackRequest } from "./types";

export function useAudioPlayback() {
  const items = useAppSelector(selectPlaybackItems);
  const currentId = useAppSelector(selectPlaybackCurrentId);
  const currentItem = useAppSelector(selectPlaybackCurrentItem);
  const pending = useAppSelector(selectPlaybackPending);
  const rate = useAppSelector(selectPlaybackRate);
  const isActive = useAppSelector(selectIsPlaybackActive);

  const enqueue = useCallback(
    (request: PlaybackRequest) => enqueuePlayback(request),
    [],
  );
  const pause = useCallback(() => pausePlayback(), []);
  const resume = useCallback(() => resumePlayback(), []);
  const skip = useCallback(() => skipPlayback(), []);
  const playItem = useCallback((id: string) => playPlaybackItem(id), []);
  const remove = useCallback((id: string) => removePlaybackItem(id), []);
  const clear = useCallback(() => clearPlayback(), []);
  const setRate = useCallback((value: number) => setPlaybackRate(value), []);

  return {
    items,
    currentId,
    currentItem,
    pending,
    rate,
    isActive,
    enqueue,
    pause,
    resume,
    skip,
    playItem,
    remove,
    clear,
    setRate,
  };
}
