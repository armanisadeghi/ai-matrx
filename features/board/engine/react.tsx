"use client";

/**
 * React bindings for the Board camera store — every hook reads a COARSE channel,
 * never the per-frame camera.
 */

import { createContext, useContext, useSyncExternalStore } from "react";
import type { BoardCameraStore, TileLife } from "./camera-store";
import type { DetailTier, PaceTier } from "./lod";
import type { SnapSettings } from "./snap-preference";
import type { SnapOverlay } from "./snapping";

export const BoardCameraStoreContext = createContext<BoardCameraStore | null>(null);

/** The element a focused tile portals into (screen space, over the plane). */
export const FocusHostContext = createContext<HTMLElement | null>(null);

export function useBoardCameraStore(): BoardCameraStore {
  const store = useContext(BoardCameraStoreContext);
  if (!store) {
    throw new Error(
      "useBoardCameraStore: no <BoardViewport> above this component — Board tiles only render inside a viewport.",
    );
  }
  return store;
}

export function useDetailTier(): DetailTier {
  const store = useBoardCameraStore();
  return useSyncExternalStore(store.subscribeTier, store.getTier, store.getTier);
}

export function useTileVisible(id: string): boolean {
  const store = useBoardCameraStore();
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
  const store = useBoardCameraStore();
  return useSyncExternalStore(
    store.subscribeSelection,
    store.getSelected,
    store.getSelected,
  );
}

export function useFocusedTile(): string | null {
  const store = useBoardCameraStore();
  return useSyncExternalStore(store.subscribeFocus, store.getFocused, store.getFocused);
}

export function useActiveTool() {
  const store = useBoardCameraStore();
  return useSyncExternalStore(store.subscribeUi, store.getTool, store.getTool);
}

export function useLayoutGuides(): boolean {
  const store = useBoardCameraStore();
  return useSyncExternalStore(store.subscribeUi, store.getGuides, store.getGuides);
}

export function useSnapSettings(): SnapSettings {
  const store = useBoardCameraStore();
  return useSyncExternalStore(store.subscribeUi, store.getSnapSettings, store.getSnapSettings);
}

/** The guide lines of the drag in flight (null when none). Read in ONE leaf, never a tile. */
export function useSnapOverlay(): SnapOverlay | null {
  const store = useBoardCameraStore();
  return useSyncExternalStore(store.subscribeSnapOverlay, store.getSnapOverlay, store.getSnapOverlay);
}

/** The tile whose content currently receives input natively, if any. */
export function useEditingTile(): string | null {
  const store = useBoardCameraStore();
  return useSyncExternalStore(store.subscribeEditing, store.getEditing, store.getEditing);
}

// ── per-tile booleans: a click re-renders the two tiles whose answer changed,
// never every tile on the board (an id-returning hook wakes them all). ──────

export function useIsSelected(id: string): boolean {
  const store = useBoardCameraStore();
  const get = () => store.getSelected() === id;
  return useSyncExternalStore(store.subscribeSelection, get, get);
}

export function useIsFocused(id: string): boolean {
  const store = useBoardCameraStore();
  const get = () => store.getFocused() === id;
  return useSyncExternalStore(store.subscribeFocus, get, get);
}

export function useIsEditing(id: string): boolean {
  const store = useBoardCameraStore();
  const get = () => store.getEditing() === id;
  return useSyncExternalStore(store.subscribeEditing, get, get);
}

/**
 * THE live tile — the one whose feature surface registers for agents. One at
 * a time: full screen wins, then the tile being worked in, then the selected
 * one (selecting another tile while one is full screen never makes two live).
 */
export function useIsLiveTile(id: string): boolean {
  const store = useBoardCameraStore();
  const get = () => (store.getFocused() ?? store.getEditing() ?? store.getSelected()) === id;
  const subscribe = (l: () => void) => {
    const a = store.subscribeSelection(l);
    const b = store.subscribeEditing(l);
    const c = store.subscribeFocus(l);
    return () => {
      a();
      b();
      c();
    };
  };
  return useSyncExternalStore(subscribe, get, get);
}

/** The tile's content lifecycle (`TileLife`). */
export function useTileLife(id: string): TileLife {
  const store = useBoardCameraStore();
  return useSyncExternalStore(
    (l) => store.subscribeLife(id, l),
    () => store.getLife(id),
    () => "live" as TileLife,
  );
}
