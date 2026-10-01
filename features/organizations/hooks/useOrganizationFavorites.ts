"use client";

/**
 * Organization favorites — the stars in the organization picker (owner,
 * 2026-10-01: "add a star you can click to favorite any of them").
 *
 * ONE STORE: the platform's canonical per-person flag table,
 * `platform.user_entity_state`, through `public.ues_set` / `ues_list` with
 * entity_type `organization` — the same store agent and model favorites use.
 * A favorite is a fact about a record, not a configuration value, so it is
 * neither a preference-blob field nor a knob. `ues_set` refuses a record the
 * person cannot open.
 *
 * One module-level cache so every picker on screen (the account rail, the
 * phone drawer, any notice) agrees the moment a star changes.
 *
 * CARRY-OVER: the picker's old single star lived in the preferences blob
 * (`organization.defaultOrganizationId`). The first read here makes that
 * organization a favorite, so nobody loses the star they had.
 *
 * It picks no organization for anyone: which organization a person works in
 * is this device's remembered choice (`resolveActiveOrgContext`).
 */

import { useEffect, useSyncExternalStore } from "react";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectDefaultOrganizationId } from "@/lib/redux/preferences/userPreferenceSelectors";
import { selectIsAuthenticated } from "@/lib/redux/selectors/userSelectors";
import { createClient } from "@/utils/supabase/client";
import { toast } from "@/lib/toast";

const ENTITY_TYPE = "organization";

type UesRow = { entity_type: string; entity_id: string; is_favorite: boolean };

let favorites: readonly string[] = [];
let loaded = false;
let loading: Promise<void> | null = null;
let carriedOver = false;
const listeners = new Set<() => void>();

function emit(next: readonly string[]) {
  favorites = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

async function writeFavorite(id: string, favorite: boolean): Promise<boolean> {
  const { error } = await createClient().rpc("ues_set", {
    p_entity_type: ENTITY_TYPE,
    p_entity_id: id,
    p_is_favorite: favorite,
  });
  if (error) {
    console.error("[useOrganizationFavorites] ues_set failed", { id, favorite, error });
    return false;
  }
  return true;
}

function load(): Promise<void> {
  if (loaded) return Promise.resolve();
  if (loading) return loading;
  loading = (async () => {
    const { data, error } = await createClient().rpc("ues_list", { p_kind: "favorite" });
    loading = null;
    if (error) {
      // Never silent: the picker still works; the stars just are not shown yet.
      console.error("[useOrganizationFavorites] ues_list failed", error);
      return;
    }
    loaded = true;
    const rows = (Array.isArray(data) ? data : []) as UesRow[];
    emit(rows.filter((row) => row.entity_type === ENTITY_TYPE && row.is_favorite).map((row) => row.entity_id));
  })();
  return loading;
}

export function useOrganizationFavorites() {
  const isAuthenticated = useAppSelector(selectIsAuthenticated);
  const legacyStar = useAppSelector(selectDefaultOrganizationId);
  const favoriteIds = useSyncExternalStore(subscribe, () => favorites, () => favorites);

  useEffect(() => {
    if (!isAuthenticated) return;
    void load().then(() => {
      // Carry the old single star over once, if it is not a favorite already.
      if (!loaded || carriedOver || !legacyStar || favorites.includes(legacyStar)) return;
      carriedOver = true;
      emit([...favorites, legacyStar]);
      void writeFavorite(legacyStar, true);
    });
  }, [isAuthenticated, legacyStar]);

  const toggleFavorite = (id: string, favorite: boolean) => {
    const previous = favorites;
    emit(favorite ? [...favorites.filter((f) => f !== id), id] : favorites.filter((f) => f !== id));
    void writeFavorite(id, favorite).then((ok) => {
      // Refused (e.g. no longer a member): put the list back as it was, and say so.
      if (!ok) {
        emit(previous);
        toast.error(favorite ? "Could not add to favorites" : "Could not remove from favorites");
      }
    });
  };

  return { favoriteIds, toggleFavorite };
}
