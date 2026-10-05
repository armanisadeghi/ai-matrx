/**
 * The viewer's snapping choices — kept in this browser only (a per-viewer
 * convenience, like `matrx.board.wheelMode`), so they follow the person across
 * boards. Blocked storage falls back to the defaults for the visit.
 */

export interface SnapSettings {
  /** Smart guides: snap to other tiles' edges and draw guide lines. Default ON. */
  smartGuides: boolean;
  /** Snap to grid: positions and resize edges round to GRID_SIZE. Default OFF. */
  grid: boolean;
}

export const DEFAULT_SNAP_SETTINGS: SnapSettings = { smartGuides: true, grid: false };

export const SMART_GUIDES_KEY = "matrx.board.smartGuides";
export const SNAP_GRID_KEY = "matrx.board.snapToGrid";

type StorageLike = Pick<Storage, "getItem" | "setItem">;

function read(storage: StorageLike, key: string, fallback: boolean): boolean {
  try {
    const v = storage.getItem(key);
    return v === "1" ? true : v === "0" ? false : fallback;
  } catch {
    return fallback;
  }
}

export function loadSnapSettings(storage?: StorageLike): SnapSettings {
  const s = storage ?? (typeof window !== "undefined" ? window.localStorage : undefined);
  if (!s) return DEFAULT_SNAP_SETTINGS;
  return {
    smartGuides: read(s, SMART_GUIDES_KEY, DEFAULT_SNAP_SETTINGS.smartGuides),
    grid: read(s, SNAP_GRID_KEY, DEFAULT_SNAP_SETTINGS.grid),
  };
}

export function saveSnapSettings(settings: SnapSettings, storage?: StorageLike): void {
  try {
    const s = storage ?? window.localStorage;
    s.setItem(SMART_GUIDES_KEY, settings.smartGuides ? "1" : "0");
    s.setItem(SNAP_GRID_KEY, settings.grid ? "1" : "0");
  } catch {
    // Storage blocked (private window): the choice lasts for this visit.
  }
}
