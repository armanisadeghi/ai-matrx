"use client";

/**
 * Back to the list puts you where you were (Linear): how many rows were
 * loaded, how far down you had scrolled, and which row had the cursor — kept
 * per view address for this tab (sessionStorage), read once when the list
 * comes back. A per-tab convenience: without storage the list simply starts
 * at the top.
 */

import { useEffect, useRef, useState } from "react";
import type { HubState } from "@/features/knowledge/hub/hubState";

export interface SavedListPlace {
  depth?: number;
  scrollTop?: number;
  focusedKey?: string | null;
}

const PREFIX = "knowledge-hub:list:";

/** The address of what the list shows — everything but the peek. */
export function listRestoreKey(state: HubState): string {
  return JSON.stringify({ v: state.view, q: state.query, g: state.group, l: state.layout, s: state.stage, d: state.data });
}

function read(key: string): SavedListPlace | null {
  try {
    const raw = window.sessionStorage.getItem(PREFIX + key);
    return raw ? (JSON.parse(raw) as SavedListPlace) : null;
  } catch {
    return null;
  }
}

export function useListRestore(key: string) {
  // Read once per address, on the first render that sees it.
  const [saved, setSaved] = useState<SavedListPlace | null>(() => (typeof window === "undefined" ? null : read(key)));
  const [savedKey, setSavedKey] = useState(key);
  if (savedKey !== key) {
    setSavedKey(key);
    setSaved(typeof window === "undefined" ? null : read(key));
  }
  const place = useRef<SavedListPlace>({});
  const timer = useRef<number | null>(null);
  const save = (next: SavedListPlace) => {
    place.current = { ...place.current, ...next };
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      try {
        window.sessionStorage.setItem(PREFIX + key, JSON.stringify(place.current));
      } catch {
        /* storage off: the list starts at the top next time */
      }
    }, 150);
  };
  useEffect(() => {
    place.current = { ...(saved ?? {}) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return { saved, save };
}
