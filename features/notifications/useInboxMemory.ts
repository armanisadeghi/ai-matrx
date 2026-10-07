"use client";

/**
 * useInboxMemory — the ONE read/write path for the bell's per-person source memory
 * (`preferences.inbox`, synced to `users.user_preferences`, so it follows the person to every
 * device). Replaces the browser-only `matrx:inbox:seen-source-counts` localStorage key, which
 * forgot everything on a second device and showed old items as new there.
 *
 * Until the saved record has loaded, `ready` is false and the bell counts no source at all — the
 * built-in empty marks would otherwise read every waiting item as new.
 */

import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { setModulePreferences, type InboxPreferences } from "@/lib/redux/preferences/userPreferencesSlice";
import type { RootState } from "@/lib/redux/store";

const selectInboxPrefs = (state: RootState) => state.userPreferences.inbox;
const selectPrefsLoaded = (state: RootState) => state.userPreferences._meta.loadStatus === "loaded";

export interface InboxMemory extends InboxPreferences {
  ready: boolean;
  save: (patch: Partial<InboxPreferences>) => void;
}

export function useInboxMemory(): InboxMemory {
  const dispatch = useAppDispatch();
  const prefs = useAppSelector(selectInboxPrefs);
  const ready = useAppSelector(selectPrefsLoaded);
  return {
    sourcesSeen: prefs?.sourcesSeen ?? {},
    sourcesCleared: prefs?.sourcesCleared ?? {},
    hiddenSources: prefs?.hiddenSources ?? [],
    ready,
    save: (patch) => {
      dispatch(setModulePreferences({ module: "inbox", preferences: patch }));
    },
  };
}
