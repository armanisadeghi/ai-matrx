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

import { useCallback, useEffect, useMemo, useRef } from "react";
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
 * One-time adoption of the `localStorage` key a surface used BEFORE it moved
 * onto this hook.
 *
 * Deleting the old read/write is not a free migration: a user whose only
 * record of "I like the table view here" is device-local silently reverts to
 * this hook's defaults the moment the new code ships. That is the exact
 * promise — "style persists" — that the hook exists to keep, broken by the
 * change that was supposed to keep it. Four surfaces shipped that way before
 * a reviewer caught it, and the sweep has more `localStorage` copies queued,
 * so the import belongs HERE rather than being re-hand-rolled per surface.
 *
 * Runs at most once per surface, only when nothing is stored in the synced
 * tier (a synced value always wins — it is newer and cross-device), and only
 * AFTER preferences have hydrated, so it can never race an incoming sync and
 * clobber it. The legacy key is removed either way, including when `map`
 * rejects the value, so a stale unparseable string cannot be retried forever.
 */
export interface LegacyListViewImport {
  /** The `localStorage` key this surface wrote before adopting the hook. */
  key: string;
  /**
   * Map the raw stored string onto the shared axes. Return `null` to discard
   * a value that doesn't correspond to anything (never cast — see the shared
   * type's wider range: `view` allows `table | cards | rows`, and a surface
   * that renders two of those maps onto `view` + `density`).
   */
  map: (raw: string) => Partial<ListViewPrefs> | null;
}

/**
 * @param surfaceKey Stable id for the list surface, e.g. "agents-browse".
 *   One key per list page. Never reuse a key across two different lists —
 *   their column ids would collide in `hiddenColumns`.
 * @param surfaceDefaults What THIS surface wants when the user has no stored
 *   preference (e.g. a different default sort).
 * @param legacy The `localStorage` key to adopt once, when migrating a surface
 *   off its hand-rolled persistence. Drop the argument once the old key is
 *   long gone from the field.
 */
export function useListViewPrefs(
  surfaceKey: string,
  surfaceDefaults?: Partial<ListViewPrefs>,
  legacy?: LegacyListViewImport,
): UseListViewPrefsResult {
  const dispatch = useAppDispatch();
  const stored = useAppSelector(
    (state) => state.userPreferences.listViews?.[surfaceKey],
  );
  // The same gate FeedbackButton uses: non-null means the persisted blob has
  // been merged in, so `stored === undefined` genuinely means "nothing synced"
  // rather than "not loaded yet".
  const prefsHydrated = useAppSelector(
    (state) => state.userPreferences._meta.loadedPreferences !== null,
  );
  const importedRef = useRef(false);

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

  useEffect(() => {
    if (!legacy || importedRef.current) return;
    if (!prefsHydrated || stored !== undefined) return;
    importedRef.current = true;

    let raw: string | null = null;
    try {
      raw = window.localStorage.getItem(legacy.key);
      if (raw !== null) window.localStorage.removeItem(legacy.key);
    } catch {
      // Private mode / disabled storage — nothing to adopt, nothing to clean.
      return;
    }
    if (raw === null) return;

    const patch = legacy.map(raw);
    if (!patch) return;
    dispatch(
      setPreference({
        module: "listViews",
        preference: surfaceKey,
        value: { ...resolveListViewPrefs(surfaceDefaults, undefined), ...patch },
      }),
    );
  }, [dispatch, legacy, prefsHydrated, stored, surfaceDefaults, surfaceKey]);

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
