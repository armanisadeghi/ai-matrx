/**
 * Memoized selectors over the audioPlayback slice (the playbackQueue mirror).
 */

import { createSelector } from "@reduxjs/toolkit";
import type { RootState } from "@/lib/redux/store";
import type { PlaybackItem } from "./types";

const selectAudioPlayback = (state: RootState) => state.audioPlayback;

export const selectPlaybackItems = createSelector(
  selectAudioPlayback,
  (s): PlaybackItem[] => s.items,
);

export const selectPlaybackCurrentId = createSelector(
  selectAudioPlayback,
  (s): string | null => s.currentId,
);

export const selectPlaybackRate = createSelector(
  selectAudioPlayback,
  (s): number => s.rate,
);

export const selectPlaybackCurrentItem = createSelector(
  selectPlaybackItems,
  selectPlaybackCurrentId,
  (items, currentId): PlaybackItem | null =>
    currentId ? items.find((i) => i.id === currentId) ?? null : null,
);

/** True when something is loading, playing, or paused. */
export const selectIsPlaybackActive = createSelector(
  selectPlaybackCurrentItem,
  (item): boolean =>
    !!item &&
    (item.status === "loading" ||
      item.status === "playing" ||
      item.status === "paused"),
);

/** Items still waiting in line (queued). */
export const selectPlaybackPending = createSelector(
  selectPlaybackItems,
  (items): PlaybackItem[] => items.filter((i) => i.status === "queued"),
);
