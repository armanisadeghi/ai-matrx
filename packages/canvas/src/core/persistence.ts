/**
 * Remembering the canvas between sessions — a table stake, never optional.
 *
 * The default port writes to localStorage under a versioned key. Items whose
 * kind opts out (`restore: false`, e.g. a live session that cannot come back)
 * are dropped from the snapshot, and panes they leave empty are dropped too.
 */

import { removePane } from "./layout";
import type { CanvasItemId, CanvasState } from "./types";

export interface CanvasPersistencePort {
  load(): CanvasState | null | Promise<CanvasState | null>;
  save(snapshot: CanvasState): void | Promise<void>;
}

export const CANVAS_STORAGE_KEY = "ai-matrx.canvas.v1";

export function createLocalStorageCanvasPersistence(
  key: string = CANVAS_STORAGE_KEY,
  storage: Pick<Storage, "getItem" | "setItem"> | null = typeof window === "undefined" ? null : safeLocalStorage(),
): CanvasPersistencePort {
  return {
    load() {
      if (!storage) return null;
      const raw = storage.getItem(key);
      if (!raw) return null;
      try {
        return JSON.parse(raw) as CanvasState;
      } catch {
        return null;
      }
    },
    save(snapshot) {
      storage?.setItem(key, JSON.stringify(snapshot));
    },
  };
}

function safeLocalStorage(): Storage | null {
  try {
    const probe = "__mxc_probe__";
    window.localStorage.setItem(probe, "1");
    window.localStorage.removeItem(probe);
    return window.localStorage;
  } catch {
    return null; // private mode / blocked storage: the canvas still works, it just forgets.
  }
}

/** Builds the snapshot that is actually written: only restorable items. */
export function toPersistableSnapshot(
  state: CanvasState,
  isRestorable: (kind: string) => boolean,
): CanvasState {
  const keep = new Set<CanvasItemId>(
    Object.values(state.items).filter((item) => isRestorable(item.kind)).map((item) => item.id),
  );
  if (keep.size === Object.keys(state.items).length) return state;
  const items = Object.fromEntries(Object.entries(state.items).filter(([id]) => keep.has(id as CanvasItemId)));
  let layout = state.layout;
  const panes: Record<string, CanvasState["panes"][string]> = {};
  for (const pane of Object.values(state.panes)) {
    const itemIds = pane.itemIds.filter((id) => keep.has(id));
    if (itemIds.length === 0 && pane.itemIds.length > 0) {
      const pruned = removePane(layout, pane.id);
      if (pruned) {
        layout = pruned;
        continue;
      }
    }
    panes[pane.id] = {
      ...pane,
      itemIds,
      activeItemId: pane.activeItemId && keep.has(pane.activeItemId) ? pane.activeItemId : (itemIds[0] ?? null),
    };
  }
  const focusedPaneId = panes[state.focusedPaneId] ? state.focusedPaneId : (Object.values(panes)[0]?.id ?? state.focusedPaneId);
  return { ...state, items, panes, layout, focusedPaneId };
}
