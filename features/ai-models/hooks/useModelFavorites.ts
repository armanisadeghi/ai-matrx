"use client";

/**
 * Model-picker favorites.
 *
 * TWO STORES, same pattern as `usePinned`:
 *
 *   1. CANONICAL — `platform.user_entity_state` via `public.ues_set` /
 *      `ues_list` for entity_type `ai_model`. A star is a first-class
 *      per-user flag, not a field inside the preferences JSON blob. The
 *      blob is last-write-wins: any later preference save from a stale
 *      snapshot silently emptied `aiModels.favoriteModels`.
 *
 *   2. PRESENTATION CACHE — `userPreferences.aiModels.favoriteModels`.
 *      Instant paint from Redux (already hydrated). Reconciled from the
 *      canonical ledger on mount and whenever the picker opens, and
 *      back-filled the other way so existing preference-only stars
 *      survive the cutover.
 *
 * Writes go through the browser Supabase client (JWT `auth.uid()`), not
 * `favoritesService`. That wrapper's `requireUserId()` reads Redux
 * `userAuth` and throws "Not authenticated" when the slice has not
 * hydrated — the class that made stars vanish with no error on screen.
 */

import { useEffect } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { setPreference } from "@/lib/redux/preferences/userPreferencesSlice";
import { selectFavoriteModelIds } from "@/lib/redux/preferences/userPreferenceSelectors";
import { createClient } from "@/utils/supabase/client";
import type { UserEntityState } from "@/features/scopes/types";
import {
  favoriteIdsEqual,
  MODEL_FAVORITE_ENTITY_TYPE,
  reconcileModelFavoriteIds,
} from "@/features/ai-models/hooks/modelFavorites";

type UesListRow = {
  entity_type: string;
  entity_id: string;
  is_favorite: boolean;
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function writeCanonicalFavorite(
  id: string,
  isFavorite: boolean,
): Promise<void> {
  if (!UUID_RE.test(id)) {
    console.error("[useModelFavorites] not a model uuid — skip ues_set", {
      id,
    });
    return;
  }
  try {
    // Fresh browser client at call time — the module singleton can be the
    // SSR-constructed client with no live session, which made getSession()
    // hang and the write never leave the tab.
    const { error } = await createClient().rpc("ues_set", {
      p_entity_type: MODEL_FAVORITE_ENTITY_TYPE,
      p_entity_id: id,
      p_is_favorite: isFavorite,
    });
    if (error) {
      console.error("[useModelFavorites] ues_set failed", {
        id,
        isFavorite,
        error,
      });
    }
  } catch (error) {
    console.error("[useModelFavorites] ues_set threw", {
      id,
      isFavorite,
      error,
    });
  }
}

async function listCanonicalFavorites(): Promise<string[] | null> {
  try {
    const { data, error } = await createClient().rpc("ues_list", {
      p_kind: "favorite",
    });
    if (error) {
      console.error("[useModelFavorites] ues_list failed", error);
      return null;
    }
    const rows = (Array.isArray(data) ? data : []) as Array<
      UesListRow | UserEntityState
    >;
    return rows
      .filter((row) => {
        const entityType =
          "entityType" in row ? row.entityType : row.entity_type;
        const isFavorite =
          "isFavorite" in row ? row.isFavorite : row.is_favorite;
        return entityType === MODEL_FAVORITE_ENTITY_TYPE && isFavorite;
      })
      .map((row) => ("entityId" in row ? row.entityId : row.entity_id));
  } catch (error) {
    console.error("[useModelFavorites] ues_list threw", error);
    return null;
  }
}

export {
  favoriteIdsEqual,
  MODEL_FAVORITE_ENTITY_TYPE,
  reconcileModelFavoriteIds,
} from "@/features/ai-models/hooks/modelFavorites";

export function useModelFavorites(active: boolean) {
  const dispatch = useAppDispatch();
  const favoriteIds = useAppSelector(selectFavoriteModelIds);
  const favoriteSet = new Set(favoriteIds);

  useEffect(() => {
    // Reconcile on mount AND when the picker opens. Mount catches the
    // staleAfter blob wipe before the user opens the menu; open retries
    // after a session that was not ready on first paint.
    let cancelled = false;
    const cacheAtOpen = favoriteIds;

    void listCanonicalFavorites().then((fromCanonical) => {
      if (cancelled || fromCanonical == null) return;
      const { merged, missingFromCanonical } = reconcileModelFavoriteIds(
        cacheAtOpen,
        fromCanonical,
      );
      for (const id of missingFromCanonical) {
        void writeCanonicalFavorite(id, true);
      }
      if (!favoriteIdsEqual(cacheAtOpen, merged)) {
        dispatch(
          setPreference({
            module: "aiModels",
            preference: "favoriteModels",
            value: merged,
          }),
        );
      }
    });

    return () => {
      cancelled = true;
    };
    // Snapshot cache at the moment we sync — do not re-reconcile on every star.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, dispatch]);

  const toggleFavorite = (id: string) => {
    const willFavorite = !favoriteSet.has(id);
    const next = willFavorite
      ? [...favoriteIds, id]
      : favoriteIds.filter((existing) => existing !== id);
    dispatch(
      setPreference({
        module: "aiModels",
        preference: "favoriteModels",
        value: next,
      }),
    );
    void writeCanonicalFavorite(id, willFavorite);
  };

  return { favoriteIds, favoriteSet, toggleFavorite };
}
