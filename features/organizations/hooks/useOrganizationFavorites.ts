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
 * It picks no organization for anyone: which organization the shell opens to
 * is the load ladder's answer (`resolveActiveOrgContext`).
 */

import { useEffect, useSyncExternalStore } from "react";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectIsAuthenticated } from "@/lib/redux/selectors/userSelectors";
import { readOrganizationFavourites, setOrganizationFavourite } from "@ai-matrx/data/organizations";
import { createClient } from "@/utils/supabase/client";
import { toast } from "@/lib/toast";

let favorites: readonly string[] = [];
let loaded = false;
let loading: Promise<void> | null = null;
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
  try {
    await setOrganizationFavourite(createClient(), id, favorite);
    return true;
  } catch (error) {
    console.error("[useOrganizationFavorites] ues_set failed", { id, favorite, error });
    return false;
  }
}

function load(): Promise<void> {
  if (loaded) return Promise.resolve();
  if (loading) return loading;
  loading = (async () => {
    let ids: string[];
    try {
      ids = await readOrganizationFavourites(createClient());
    } catch (error) {
      loading = null;
      // Never silent: the picker still works; the stars just are not shown yet.
      console.error("[useOrganizationFavorites] ues_list failed", error);
      return;
    }
    loading = null;
    loaded = true;
    emit(ids);
  })();
  return loading;
}

export function useOrganizationFavorites() {
  const isAuthenticated = useAppSelector(selectIsAuthenticated);
  const favoriteIds = useSyncExternalStore(subscribe, () => favorites, () => favorites);

  useEffect(() => {
    if (!isAuthenticated) return;
    void load();
  }, [isAuthenticated]);

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
