"use client";

/**
 * React bindings for the spatial store — every hook reads a COARSE channel,
 * never the per-frame camera.
 */

import { createContext, useContext, useSyncExternalStore } from "react";
import type { SpatialStore } from "./spatial-store";
import type { DetailTier, PaceTier } from "./lod";

export const SpatialStoreContext = createContext<SpatialStore | null>(null);

export function useSpatialStore(): SpatialStore {
  const store = useContext(SpatialStoreContext);
  if (!store) {
    throw new Error(
      "useSpatialStore: no <SpatialViewport> above this component — spatial tiles only render inside a viewport.",
    );
  }
  return store;
}

export function useDetailTier(): DetailTier {
  const store = useSpatialStore();
  return useSyncExternalStore(store.subscribeTier, store.getTier, store.getTier);
}

export function useTileVisible(id: string): boolean {
  const store = useSpatialStore();
  return useSyncExternalStore(
    (l) => store.subscribeVisible(id, l),
    () => store.isVisible(id),
    () => true,
  );
}

/** The pacing tier for one tile: its detail tier, or `offscreen` when culled. */
export function usePaceTier(id: string): PaceTier {
  const tier = useDetailTier();
  const visible = useTileVisible(id);
  return visible ? tier : "offscreen";
}

export function useSelectedTile(): string | null {
  const store = useSpatialStore();
  return useSyncExternalStore(
    store.subscribeSelection,
    store.getSelected,
    store.getSelected,
  );
}
