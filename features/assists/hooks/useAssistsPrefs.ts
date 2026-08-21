"use client";

/**
 * useAssistsPrefs — the ONE read/write path for the user's assist chrome:
 * where the dock sits, and whether assists are quiet right now.
 *
 * Both live in the canonical synced preferences blob (`preferences.assists`),
 * so a mute set on a laptop is honoured on a phone and every producer asks the
 * same question. No second localStorage key, no per-surface copy — that is the
 * pattern `useListViewPrefs` exists to have killed.
 */

import { useEffect, useState } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { setModulePreferences } from "@/lib/redux/preferences/userPreferencesSlice";
import type { RootState } from "@/lib/redux/store";
import { isQuiet, QUIET_FOREVER, quietUntil, type QuietWindowKey } from "../quiet";
import type { DockOffset } from "../dock-position";

const selectAssistsPrefs = (state: RootState) => state.userPreferences.assists;

export interface AssistsPrefsApi {
  /** Remote preferences have hydrated; safe to create a new cycle. */
  ready: boolean;
  /** Everything is quiet right now (flips back on its own at the deadline). */
  quiet: boolean;
  /** The raw stored value — ISO, `"infinity"`, or null. */
  quietUntil: string | null;
  goQuiet: (window: QuietWindowKey) => void;
  /** Turn assists back on immediately. */
  resume: () => void;
  /** Stored dock offset, or null for the default corner. */
  dockPosition: DockOffset | null;
  setDockPosition: (offset: DockOffset | null) => void;
  presentationCycle: {
    startedAt: string;
    assistIds: string[];
  } | null;
  setPresentationCycle: (
    cycle: { startedAt: string; assistIds: string[] } | null,
  ) => void;
}

/**
 * A quiet window has to END on its own. `isQuiet` is evaluated during render,
 * and this effect exists only to schedule ONE re-render at the deadline —
 * without it, "quiet for an hour" silently becomes "quiet until I reload", and
 * a control that outlives its own promise is one the user stops trusting.
 * `setTimeout` saturates past ~24.8 days, so a longer window simply
 * re-evaluates on the next mount (correct at this coarseness).
 */
function useQuietNow(until: string | null): boolean {
  const [, tick] = useState(0);
  useEffect(() => {
    if (!until || until === QUIET_FOREVER) return;
    const remaining = Date.parse(until) - Date.now();
    if (Number.isNaN(remaining) || remaining <= 0 || remaining > 2_000_000_000) {
      return;
    }
    const id = setTimeout(() => tick((n) => n + 1), remaining + 500);
    return () => clearTimeout(id);
  }, [until]);
  return isQuiet(until);
}

export function useAssistsPrefs(): AssistsPrefsApi {
  const dispatch = useAppDispatch();
  const prefs = useAppSelector(selectAssistsPrefs);
  const ready = useAppSelector(
    (state) => state.userPreferences._meta.loadedPreferences !== null,
  );
  const storedUntil = prefs?.quietUntil ?? null;
  const quiet = useQuietNow(storedUntil);

  const write = (patch: {
    quietUntil?: string | null;
    dockPosition?: DockOffset | null;
  }) => {
    dispatch(setModulePreferences({ module: "assists", preferences: patch }));
  };

  return {
    ready,
    quiet,
    quietUntil: storedUntil,
    goQuiet: (window: QuietWindowKey) => write({ quietUntil: quietUntil(window) }),
    resume: () => write({ quietUntil: null }),
    dockPosition: prefs?.dockPosition ?? null,
    setDockPosition: (offset: DockOffset | null) =>
      write({ dockPosition: offset }),
    presentationCycle: prefs?.presentationCycle ?? null,
    setPresentationCycle: (presentationCycle) =>
      dispatch(
        setModulePreferences({
          module: "assists",
          preferences: { presentationCycle },
        }),
      ),
  };
}
