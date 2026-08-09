"use client";

// lib/list-views/useListViewPrefs.ts
//
// ONE hook for "remember how I like to look at this list".
//
// It replaced every hand-rolled list-STYLE localStorage block in the app —
// TranscriptsListPage, ProjectsHub, TaskListPane, app/(core)/documents/page.tsx,
// and CloudImagesTab — each of which declared its own view-mode union and its
// own storage key, and none of which followed the user to another device.
// None are left; a new one is a defect. (Two PAGE-LAYOUT toggles — which panes
// are on screen — deliberately stay off this hook: WorkspaceViewToggle and
// user-lists' LayoutToggle. That is a different axis, not a list style.)
//
// Rides `userPreferences` (synced tier: Redux → IDB + localStorage mirror →
// Supabase `user_preferences`), so a choice made on a laptop shows up on a
// phone. No new persistence layer, no new slice.
//
// STYLE ONLY. Search text, column filters, page number, and the active scope
// tab are query state and deliberately NOT stored here — restoring a stale
// search that renders an empty list is a bug, not a feature.

import { useCallback, useMemo } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  setPreference,
  type ListViewPrefs,
} from "@/lib/redux/preferences/userPreferencesSlice";
import { resolveListViewPrefs } from "./defaults";

export interface UseListViewPrefsResult {
  prefs: ListViewPrefs;
  /** Patch one or more style fields. Persists immediately (debounced by the sync engine). */
  setPrefs: (patch: Partial<ListViewPrefs>) => void;
  /** Convenience toggles for the two most-used fields. */
  setView: (view: ListViewPrefs["view"]) => void;
  setDensity: (density: ListViewPrefs["density"]) => void;
  /** Drop this surface's stored style back to its declared defaults. */
  reset: () => void;
}

/**
 * @param surfaceKey Stable id for the list surface, e.g. "agents-browse".
 *   One key per list page. Never reuse a key across two different lists —
 *   their column ids would collide in `hiddenColumns`.
 * @param surfaceDefaults What THIS surface wants when the user has no stored
 *   preference (e.g. a different default sort).
 */
export function useListViewPrefs(
  surfaceKey: string,
  surfaceDefaults?: Partial<ListViewPrefs>,
): UseListViewPrefsResult {
  const dispatch = useAppDispatch();
  const stored = useAppSelector(
    (state) => state.userPreferences.listViews?.[surfaceKey],
  );

  const prefs = useMemo(
    () => resolveListViewPrefs(surfaceDefaults, stored),
    [surfaceDefaults, stored],
  );

  const setPrefs = useCallback(
    (patch: Partial<ListViewPrefs>) => {
      dispatch(
        setPreference({
          module: "listViews",
          preference: surfaceKey,
          // Write the resolved whole so a partial stored blob can never lose a
          // field the surface later reads.
          value: { ...prefs, ...patch },
        }),
      );
    },
    [dispatch, prefs, surfaceKey],
  );

  const setView = useCallback(
    (view: ListViewPrefs["view"]) => setPrefs({ view }),
    [setPrefs],
  );
  const setDensity = useCallback(
    (density: ListViewPrefs["density"]) => setPrefs({ density }),
    [setPrefs],
  );
  const reset = useCallback(() => {
    dispatch(
      setPreference({
        module: "listViews",
        preference: surfaceKey,
        value: resolveListViewPrefs(surfaceDefaults, undefined),
      }),
    );
  }, [dispatch, surfaceDefaults, surfaceKey]);

  return { prefs, setPrefs, setView, setDensity, reset };
}
