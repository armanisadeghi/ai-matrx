"use client";

// features/unified-data/home/useDataHomeMarks.ts — LANE DATA-HOME-3A
//
// STAR AND RECENT (DATA-HOME-3-SPEC §2.4, decision D2). A person's own marks, kept in the synced
// preference record (`lists.dataHomeStarred` / `lists.dataHomeRecent`), so a star on the laptop is a
// star on the phone. Why not the platform Favorites (`favorites.items`): it is the sidebar's pinned
// menu, capped at 50, and has no entity type for a record-store table — pinning a table there as
// `nav` would call an entity a page. Revisit when the store's tables get an entity type.
//
// Recent is written when a row is opened FROM THIS LIST only (the open handler); opening a table
// from anywhere else is not tracked in v1.

import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { setPreference } from "@/lib/redux/preferences/userPreferencesSlice";
import type { RootState } from "@/lib/redux/store";

/** The most rows a person can star. Stated, never silent: the star control says so at the cap. */
export const DATA_HOME_STAR_CAP = 500;
export const DATA_HOME_RECENT_MAX = 10;

const EMPTY: readonly string[] = [];

export function nextStarred(current: readonly string[], id: string): { next: string[]; refused: boolean } {
  if (current.includes(id)) return { next: current.filter((x) => x !== id), refused: false };
  if (current.length >= DATA_HOME_STAR_CAP) return { next: [...current], refused: true };
  return { next: [id, ...current], refused: false };
}

export function nextRecent(current: readonly string[], id: string): string[] {
  return [id, ...current.filter((x) => x !== id)].slice(0, DATA_HOME_RECENT_MAX);
}

export function useDataHomeMarks() {
  const dispatch = useAppDispatch();
  const starred = useAppSelector((s: RootState) => s.userPreferences.lists.dataHomeStarred ?? EMPTY);
  const recent = useAppSelector((s: RootState) => s.userPreferences.lists.dataHomeRecent ?? EMPTY);
  return {
    starred,
    recent,
    /** Replace the starred set (the caller has applied `nextStarred` and its cap). */
    setStarred(next: readonly string[]) {
      dispatch(setPreference({ module: "lists", preference: "dataHomeStarred", value: [...next] }));
    },
    opened(id: string) {
      dispatch(setPreference({ module: "lists", preference: "dataHomeRecent", value: nextRecent(recent, id) }));
    },
  };
}

/**
 * "SHOW PLATFORM TABLES" IS THE PERSON'S OWN (lane 10 item 7): kept in the synced preference record
 * (`lists.dataHomeShowPlatformTables`) beside the stars, so the home opens the way she left it, on any
 * device. Off by default: a choice column's Lists and an agent's outputs wait behind the switch.
 */
export function useDataHomeShowPlatformTables(): [boolean, (on: boolean) => void] {
  const dispatch = useAppDispatch();
  const on = useAppSelector((s: RootState) => s.userPreferences.lists.dataHomeShowPlatformTables) === true;
  return [on, (next) => dispatch(setPreference({ module: "lists", preference: "dataHomeShowPlatformTables", value: next }))];
}
