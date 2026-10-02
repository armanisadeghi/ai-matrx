"use client";

/**
 * The `matrx-user/canvas` surface emitter for the canvas column: what agents
 * are told is on the canvas right now. `getScope` runs at Run time and reads
 * the canvas straight from its store, so a tab switched or closed between
 * render and launch is reported as it is, never as a stale snapshot.
 */

import { listPaneIds } from "@ai-matrx/canvas";
import { useCanvas } from "@ai-matrx/canvas/react";
import { buildCanvasScope, type CanvasScopeItem } from "@/features/canvas/lib/canvas-scope";
import { contentOf, readArtifactItemData } from "./artifactItem";

export function useCanvasSurfaceScope() {
  const canvas = useCanvas();
  return () => {
    const state = canvas.getState();
    const items: CanvasScopeItem[] = [];
    for (const item of Object.values(state.items)) {
      const data = readArtifactItemData(item.data);
      if (!data) continue;
      items.push({ id: item.id, content: contentOf(data), ...(data.savedItemId ? { savedItemId: data.savedItemId } : {}) });
    }
    const paneIds = listPaneIds(state.layout);
    const focused = state.panes[state.focusedPaneId];
    const other = paneIds.map((id) => state.panes[id]).find((pane) => pane && pane.id !== state.focusedPaneId);
    return buildCanvasScope({
      items,
      currentItemId: state.isOpen ? (focused?.activeItemId ?? null) : null,
      secondaryItemId: other?.activeItemId ?? null,
      renderMode: "global",
      isSplit: paneIds.length > 1,
    });
  };
}
