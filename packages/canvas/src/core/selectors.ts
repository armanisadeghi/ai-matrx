/**
 * Selectors over CanvasState. Each returns a value that is referentially
 * stable for an unchanged state, so they are safe in useSyncExternalStore and
 * in a host's useSelector.
 */

import { listPaneIds } from "./layout";
import type { CanvasItem, CanvasItemId, CanvasPane, CanvasPaneId, CanvasState } from "./types";

export const selectCanvasIsOpen = (s: CanvasState): boolean => s.isOpen;
export const selectCanvasIsFullscreen = (s: CanvasState): boolean => s.isFullscreen;
export const selectCanvasWidth = (s: CanvasState): number => s.width;
export const selectCanvasLayout = (s: CanvasState) => s.layout;
export const selectCanvasFocusedPaneId = (s: CanvasState): CanvasPaneId => s.focusedPaneId;
export const selectCanvasIsHydrated = (s: CanvasState): boolean => s.hydrated;
export const selectCanvasItemCount = (s: CanvasState): number => Object.keys(s.items).length;

export const selectCanvasPane = (s: CanvasState, paneId: CanvasPaneId): CanvasPane | undefined => s.panes[paneId];
export const selectCanvasItem = (s: CanvasState, itemId: CanvasItemId): CanvasItem | undefined => s.items[itemId];

export function selectCanvasPaneCount(s: CanvasState): number {
  return listPaneIds(s.layout).length;
}

/** The item the person is looking at in the focused pane. */
export function selectCanvasActiveItem(s: CanvasState): CanvasItem | null {
  const pane = s.panes[s.focusedPaneId];
  return pane?.activeItemId ? (s.items[pane.activeItemId] ?? null) : null;
}
