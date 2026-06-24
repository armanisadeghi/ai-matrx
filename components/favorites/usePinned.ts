"use client";

// usePinned — the single hook every surface uses to read/toggle favorites.
//
// Favorites live in the user_preferences JSON (already fetched, synced across
// devices/tabs, and hydrated into Redux at boot). That means reading favorites
// is INSTANT and free — no fetch — which is exactly why the sidebar Favorites
// menu and the dashboard "Pinned" grid can render the moment they mount.
//
// Dedupe + cap are enforced in the slice reducers (single source of truth), so
// this hook is a thin, ergonomic wrapper. React Compiler is on — no manual
// memoization.

import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  addFavorite,
  removeFavorite,
  toggleFavorite,
  reorderFavorites,
  type FavoriteItem,
} from "@/lib/redux/preferences/userPreferencesSlice";
import {
  selectFavoriteItems,
  selectFavoriteIdSet,
  selectFavoriteCount,
} from "@/lib/redux/preferences/userPreferenceSelectors";

/** Everything a callsite must supply to pin something. `pinnedAt` is stamped here. */
export type FavoriteInput = Omit<FavoriteItem, "pinnedAt">;

export interface UsePinnedResult {
  /** Ordered pinned items (newest first until reordered). */
  favorites: FavoriteItem[];
  count: number;
  isPinned: (id: string) => boolean;
  pin: (item: FavoriteInput) => void;
  unpin: (id: string) => void;
  /** Pin if absent, unpin if present. Returns the resulting pinned state. */
  toggle: (item: FavoriteInput) => boolean;
  /** Persist a new order by id. */
  reorder: (orderedIds: string[]) => void;
}

export function usePinned(): UsePinnedResult {
  const dispatch = useAppDispatch();
  const favorites = useAppSelector(selectFavoriteItems);
  const idSet = useAppSelector(selectFavoriteIdSet);
  const count = useAppSelector(selectFavoriteCount);

  const stamp = (item: FavoriteInput): FavoriteItem => ({
    ...item,
    pinnedAt: new Date().toISOString(),
  });

  return {
    favorites,
    count,
    isPinned: (id: string) => idSet.has(id),
    pin: (item: FavoriteInput) => dispatch(addFavorite(stamp(item))),
    unpin: (id: string) => dispatch(removeFavorite(id)),
    toggle: (item: FavoriteInput) => {
      const willPin = !idSet.has(item.id);
      dispatch(toggleFavorite(stamp(item)));
      return willPin;
    },
    reorder: (orderedIds: string[]) => dispatch(reorderFavorites(orderedIds)),
  };
}

/**
 * Build a stable favorite `id` from a kind + entity id. Use for record
 * favorites so the same entity can never be pinned twice. `nav` favorites use
 * their href directly as the id.
 */
export function favoriteId(kind: FavoriteItem["kind"], entityId: string): string {
  return kind === "nav" ? entityId : `${kind}:${entityId}`;
}
