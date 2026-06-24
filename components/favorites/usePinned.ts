"use client";

// usePinned — the single hook every surface uses to read/toggle favorites.
//
// TWO BACKING STORES, one stable API:
//
//   1. CANONICAL (system of record) — `platform.user_entity_state`, written
//      through `favoritesService` (the `ues_*` RPC chokepoint). This is where
//      "is this favorited?" now LIVES. Every pin/unpin/toggle writes the flag
//      here. Entity favorites use their real uuid; `nav` destinations aren't
//      entities (no uuid) so they map to a deterministic `uuidv5(href)` under
//      entity_type "nav" — the per-user-state table's entity_type is free text.
//
//   2. PRESENTATION CACHE — the `user_preferences` favorites JSON (already
//      fetched, synced across devices/tabs, hydrated into Redux at boot). It
//      holds the self-contained display SNAPSHOT (label/href/icon/color/order)
//      so the sidebar Favorites menu and the dashboard "Pinned" grid render the
//      moment they mount — INSTANT, zero fetch. It is ALSO the transition
//      continuity read: existing favorites keep showing while the canonical
//      ledger backfills. Dedupe/cap/ordering live in the slice reducers.
//
// The public API (favorites / count / isPinned / pin / unpin / toggle / reorder)
// is unchanged. React Compiler is on — no manual memoization.

import { v5 as uuidv5 } from "uuid";
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
import { favoritesService } from "@/features/scopes/service/favoritesService";
import { isScopesRpcErr, type FavoriteKind } from "@/features/scopes/types";

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

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Fixed namespace so a given nav href ALWAYS maps to the same synthetic uuid
// (stable across reloads/devices). Arbitrary but constant — do not change, or
// existing nav favorites would orphan their canonical rows.
const NAV_NAMESPACE = "5d1d5b9e-7c2a-4e6f-9b3a-2f8c1a0d4e7b";

/**
 * Map a favorite to its canonical `(entityType, entityId)` coordinates in
 * `platform.user_entity_state`:
 *   - `nav` → ("nav", uuidv5(href)). Not a real entity; the synthetic uuid
 *     keeps the row keyable while the display href lives in the presentation
 *     cache.
 *   - everything else → (kind, uuid). The id follows the `${kind}:${uuid}`
 *     convention (see {@link favoriteId}); we strip the prefix and require a
 *     real uuid. Returns `null` for a malformed entity favorite (no uuid) so
 *     the caller can skip the canonical write loudly instead of erroring at PG.
 */
export function favoriteEntityRef(
  item: Pick<FavoriteItem, "id" | "kind" | "href">,
): { entityType: FavoriteKind; entityId: string } | null {
  if (item.kind === "nav") {
    const key = item.href || item.id;
    if (!key) return null;
    return { entityType: "nav", entityId: uuidv5(key, NAV_NAMESPACE) };
  }
  const prefix = `${item.kind}:`;
  const raw = item.id.startsWith(prefix)
    ? item.id.slice(prefix.length)
    : item.id;
  if (!UUID_RE.test(raw)) return null;
  return { entityType: item.kind, entityId: raw };
}

// Write the canonical favorite flag. Fire-and-forget from the UI's POV (the
// presentation cache already reflects the change for instant feedback), but
// LOUD on failure — a recovery layer that fires silently hides a real bug.
function writeCanonicalFavorite(
  item: Pick<FavoriteItem, "id" | "kind" | "href" | "label">,
  isFavorite: boolean,
): void {
  const ref = favoriteEntityRef(item);
  if (!ref) {
    console.warn(
      "[usePinned] favorite has no canonical entity ref — skipping user_entity_state write",
      item,
    );
    return;
  }
  void favoritesService
    .setFavorite(ref.entityType, ref.entityId, isFavorite)
    .then((res) => {
      // strictNullChecks is off repo-wide, so `!res.ok` won't narrow the
      // union — use the shared guard (same reason it exists for scopesService).
      if (isScopesRpcErr(res)) {
        console.error(
          "[usePinned] user_entity_state favorite write failed",
          { item, ref, error: res.error },
        );
      }
    });
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
    pin: (item: FavoriteInput) => {
      dispatch(addFavorite(stamp(item)));
      writeCanonicalFavorite(item, true);
    },
    unpin: (id: string) => {
      // Capture the display snapshot BEFORE removing it — the canonical write
      // needs the item's kind/href to derive its entity ref.
      const item = favorites.find((f) => f.id === id);
      dispatch(removeFavorite(id));
      if (item) writeCanonicalFavorite(item, false);
    },
    toggle: (item: FavoriteInput) => {
      const willPin = !idSet.has(item.id);
      dispatch(toggleFavorite(stamp(item)));
      writeCanonicalFavorite(item, willPin);
      return willPin;
    },
    // Ordering is a presentation concern with no canonical counterpart
    // (user_entity_state has no order column) — it stays in the prefs cache.
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
