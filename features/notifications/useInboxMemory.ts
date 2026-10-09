"use client";

/**
 * useInboxMemory — the ONE read/write path for the bell's per-person place memory
 * (`preferences.inbox`, synced to `users.user_preferences`, so it follows the person to every
 * device). Replaces the browser-only `matrx:inbox:seen-source-counts` localStorage key, which
 * forgot everything on a second device and showed old items as new there.
 *
 * Until the saved record has loaded, `ready` is false and the bell counts no place at all — the
 * built-in empty marks would otherwise read every waiting item as new.
 */

import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { setModulePreferences, type InboxPreferences } from "@/lib/redux/preferences/userPreferencesSlice";
import type { RootState } from "@/lib/redux/store";
import type { PlaceMarks } from "./badge";

const selectInboxPrefs = (state: RootState) => state.userPreferences.inbox;
const selectPrefsLoaded = (state: RootState) => state.userPreferences._meta.loadStatus === "loaded";

export interface InboxMemory {
  ready: boolean;
  /** Marks set when the bell was last opened. */
  seen: PlaceMarks;
  /** Marks set when each place was last cleared. */
  cleared: PlaceMarks;
  hiddenSources: string[];
  saveSeen: (marks: PlaceMarks) => void;
  saveCleared: (marks: PlaceMarks) => void;
  saveHidden: (keys: string[]) => void;
}

export function useInboxMemory(): InboxMemory {
  const dispatch = useAppDispatch();
  const prefs = useAppSelector(selectInboxPrefs);
  const ready = useAppSelector(selectPrefsLoaded);
  const save = (preferences: Partial<InboxPreferences>) => {
    dispatch(setModulePreferences({ module: "inbox", preferences }));
  };
  return {
    ready,
    seen: { counts: prefs?.sourcesSeen ?? {}, ids: prefs?.sourcesSeenIds ?? {} },
    cleared: { counts: prefs?.sourcesCleared ?? {}, ids: prefs?.sourcesClearedIds ?? {} },
    hiddenSources: prefs?.hiddenSources ?? [],
    saveSeen: (marks) =>
      save({ sourcesSeen: { ...marks.counts }, sourcesSeenIds: toLists(marks.ids) }),
    saveCleared: (marks) =>
      save({ sourcesCleared: { ...marks.counts }, sourcesClearedIds: toLists(marks.ids) }),
    saveHidden: (keys) => save({ hiddenSources: keys }),
  };
}

function toLists(ids: PlaceMarks["ids"]): Record<string, string[]> {
  return Object.fromEntries(Object.entries(ids).map(([key, list]) => [key, [...list]]));
}
