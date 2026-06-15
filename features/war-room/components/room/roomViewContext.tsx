"use client";

// features/war-room/components/room/roomViewContext.tsx
//
// Ephemeral, per-mount VIEW state for one War Room — never persisted, never
// touches Redux or Supabase (these are view preferences, not session data).
// Three power-user controls live here, each grafted from the bake-off winner +
// its grafts:
//
//   1. mode — "stage" (a watchlist rail + one driven thread) vs "grid" (the
//      bento gallery of every thread, all at once). The reimagine spine.
//   2. projectedTab — the Bloomberg "set the whole wall to one instrument"
//      move (dense): force every tile to the same tab (all-Tasks, all-Notes,
//      all-Audio, all-Combined) without mutating each tile's saved active_tab.
//      `null` means "respect each tile's own tab". Applies in BOTH modes.
//   3. density — "comfortable" vs "compact" (refine): retunes the gallery
//      engine's minTile floor so the operator packs more threads on demand.
//
// The staged tile id is DERIVED, not synced: we store only the user's explicit
// choice and resolve the effective staged id against the live visible list, so
// a hidden/deleted/never-chosen tile can never strand the Stage.

import {
  createContext,
  useContext,
  useMemo,
  useState,
} from "react";
import type { TileTab } from "@/features/war-room/types";
import {
  GALLERY_GAP_PX,
  GALLERY_MIN_TILE,
  GALLERY_TARGET_ASPECT,
} from "@/features/war-room/constants";

export type RoomMode = "stage" | "grid";
export type Density = "comfortable" | "compact";

export interface RoomViewState {
  mode: RoomMode;
  setMode: (m: RoomMode) => void;

  /** When set, every tile renders this tab; null → each tile's own tab. */
  projectedTab: TileTab | null;
  setProjectedTab: (t: TileTab | null) => void;

  density: Density;
  setDensity: (d: Density) => void;
  toggleDensity: () => void;

  /** The user's explicit Stage choice (may be stale — resolve against visible). */
  chosenStageId: string | null;
  setChosenStageId: (id: string) => void;
  /** Bring a tile to the Stage AND switch to Stage mode in one move. */
  stageTile: (id: string) => void;
}

const RoomViewContext = createContext<RoomViewState | null>(null);

export function RoomViewProvider({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<RoomMode>("stage");
  const [projectedTab, setProjectedTab] = useState<TileTab | null>(null);
  const [density, setDensity] = useState<Density>("comfortable");
  const [chosenStageId, setChosenStageId] = useState<string | null>(null);

  const value = useMemo<RoomViewState>(
    () => ({
      mode,
      setMode,
      projectedTab,
      setProjectedTab,
      density,
      setDensity,
      toggleDensity: () =>
        setDensity((d) => (d === "compact" ? "comfortable" : "compact")),
      chosenStageId,
      setChosenStageId,
      stageTile: (id: string) => {
        setChosenStageId(id);
        setMode("stage");
      },
    }),
    [mode, projectedTab, density, chosenStageId],
  );

  return (
    <RoomViewContext.Provider value={value}>
      {children}
    </RoomViewContext.Provider>
  );
}

export function useRoomView(): RoomViewState {
  const ctx = useContext(RoomViewContext);
  if (!ctx)
    throw new Error("useRoomView must be used within <RoomViewProvider>");
  return ctx;
}

/**
 * Resolve the effective staged tile id: honor the user's explicit choice while
 * it's still visible, otherwise default to the first visible thread. Keeps the
 * Stage from ever stranding on a hidden/deleted tile.
 */
export function resolveStagedId(
  chosenId: string | null,
  visibleIds: string[],
): string | null {
  if (chosenId && visibleIds.includes(chosenId)) return chosenId;
  return visibleIds[0] ?? null;
}

// ── Layout floors per density (consumed by the gallery engine in Grid mode) ──
// Comfortable IS the live default, single-sourced from the gallery tuning
// constants; compact lowers the floor so more threads pack into the viewport
// before the grid switches to scrolling.
export const DENSITY_LAYOUT: Record<
  Density,
  { gap: number; minTile: { width: number; height: number }; targetAspect: number }
> = {
  comfortable: {
    gap: GALLERY_GAP_PX,
    minTile: GALLERY_MIN_TILE,
    targetAspect: GALLERY_TARGET_ASPECT,
  },
  compact: {
    gap: 8,
    minTile: { width: 236, height: 172 },
    targetAspect: 3 / 2,
  },
};
