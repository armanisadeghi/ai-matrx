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

import {
  useCallback,
  useEffect,
  useMemo,
  useSyncExternalStore,
} from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  setPreference,
  type ListViewPrefs,
} from "@/lib/redux/preferences/userPreferencesSlice";
import { resolveListViewPrefs } from "./defaults";

/** `localStorage` never changes under us here — see the read below. */
const subscribeToNothing = () => () => {};

function readLocalStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    // Private mode / disabled storage — nothing to adopt.
    return null;
  }
}

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
  // The legacy value is a READ-ONLY FALLBACK, never a write.
  //
  // The obvious implementation — "if nothing is stored, dispatch the imported
  // value" — is a trap, and it shipped for one commit before review caught it.
  // `userPreferences` hydrates ASYNCHRONOUSLY from IDB (and later from the
  // remote row), so on first mount `stored === undefined` means "not loaded
  // yet", not "nothing saved". Worse, the sync middleware snapshots the WHOLE
  // partialized slice at dispatch time and debounce-writes it to
  // `users.user_preferences` — so a write fired before hydration would replace
  // the user's entire preferences row (models, voice, display, favorites) with
  // defaults. `_meta.loadedPreferences` does NOT guard against this: the store
  // initializes it non-null at construction, so it is a constant `true`.
  //
  // Reading it as a fallback has none of that risk: it cannot write anything,
  // and the moment real prefs hydrate, `stored` takes precedence. The key is
  // removed only once a synced value exists — see `setPrefs`.
  // `useSyncExternalStore`, not an effect: `localStorage` IS an external store,
  // and reading it this way gives a correct server snapshot (`null`) with no
  // hydration mismatch and no setState-in-effect. `subscribe` is a no-op
  // because the only writer is this hook's own cleanup below, which by then
  // has a synced value that takes precedence anyway. The snapshot is the raw
  // STRING — a stable primitive, so repeated reads compare equal; mapping it
  // to an object happens in `useMemo` where a new identity is harmless.
  const legacyRaw = useSyncExternalStore(
    subscribeToNothing,
    () => (legacy ? readLocalStorage(legacy.key) : null),
    () => null,
  );
  const legacyValue = useMemo(
    () => (legacy && legacyRaw !== null ? legacy.map(legacyRaw) : null),
    [legacy, legacyRaw],
  );

  const prefs = useMemo(
    () => resolveListViewPrefs(surfaceDefaults, stored ?? legacyValue),
    [surfaceDefaults, stored, legacyValue],
  );

  // Once the synced tier holds a value for this surface, the device-local key
  // is dead weight that would otherwise shadow nothing forever. Dropping it
  // here (rather than at import time) is what makes the fallback survive a
  // reload for a user who has not touched the control yet.
  useEffect(() => {
    if (!legacy || stored === undefined) return;
    try {
      window.localStorage.removeItem(legacy.key);
    } catch {
      // Nothing to clean.
    }
  }, [legacy, stored]);

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
