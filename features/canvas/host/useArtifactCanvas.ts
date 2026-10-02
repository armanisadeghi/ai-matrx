"use client";

/**
 * THE way app code puts CanvasContent on the canvas. Every opener hook
 * (useCanvas, useOpenArtifactInCanvas, useOpenCanvasItem, block wrappers…)
 * funnels through here, so identity, JSON safety and the "announce, never
 * drop" rule are enforced once.
 */

import { selectCanvasActiveItem, selectCanvasIsOpen, type CanvasController, type CanvasItemId } from "@ai-matrx/canvas";
import { useOptionalCanvas, useOptionalCanvasState } from "@ai-matrx/canvas/react";
import { reportCanvasOpenDrop, titleForDrop } from "@/features/canvas/openRequest";
import type { ArtifactDebugTrace, CanvasContent, CanvasContentType } from "@/features/canvas/canvasContent";
import { artifactOpenInput, contentOf, readArtifactItemData, type ArtifactOpenOptions } from "./artifactItem";

export interface ArtifactPointerInput {
  artifactId: string;
  type: CanvasContentType;
  metadata?: CanvasContent["metadata"] & Record<string, unknown>;
  artifactDebug?: ArtifactDebugTrace | null;
}

/**
 * Opens content on a canvas controller; returns null (and announces why) when
 * it cannot. The non-hook core of `openContent`, for callers that must not
 * subscribe to canvas state (headless openers whose effects would otherwise
 * re-run on every item update).
 */
export function openArtifactContent(
  canvas: CanvasController | null,
  content: CanvasContent,
  options: ArtifactOpenOptions = {},
): CanvasItemId | null {
  const requested = titleForDrop(content?.metadata?.title);
  if (!content?.type) {
    reportCanvasOpenDrop({ reason: "no-content", requested });
    return null;
  }
  if (content.data == null) {
    reportCanvasOpenDrop({ reason: "no-content", requested, detail: `type ${content.type} arrived with no data` });
    return null;
  }
  if (!canvas) {
    reportCanvasOpenDrop({ reason: "canvas-unavailable", requested });
    return null;
  }
  return canvas.open(artifactOpenInput(content, options));
}

export function useArtifactCanvas() {
  const canvas = useOptionalCanvas();
  const isOpen = useCanvasStateSafe();
  const activeContent = useActiveContent();

  /** Opens content; returns false (and announces why) when it cannot. */
  const openContent = (content: CanvasContent, options: ArtifactOpenOptions = {}): CanvasItemId | null =>
    openArtifactContent(canvas, content, options);

  /** Opens a saved artifact by pointer — the row is the truth, never a copy. */
  const openPointer = (input: ArtifactPointerInput): CanvasItemId | null =>
    openContent(
      {
        type: input.type,
        data: { artifactId: input.artifactId },
        metadata: { ...input.metadata, canvasItemId: input.artifactId },
      },
      { savedItemId: input.artifactId, artifactDebug: input.artifactDebug ?? null },
    );

  /** Adds a tab without revealing the canvas or stealing focus. */
  const offer = (content: CanvasContent): CanvasItemId | null => openContent(content, { quiet: true });

  return {
    isAvailable: canvas !== null,
    isOpen,
    /** The content of the tab the person is looking at, if it is an artifact. */
    activeContent,
    openContent,
    openPointer,
    offer,
    show: () => canvas?.show(),
    hide: () => canvas?.hide(),
    toggle: () => canvas?.toggle(),
    /** Closes every tab and puts the canvas away. */
    clear: () => {
      if (!canvas) return;
      for (const id of Object.keys(canvas.getState().items)) canvas.close(id as CanvasItemId);
      canvas.hide();
    },
    closeActive: () => {
      const active = canvas?.getState();
      const pane = active ? active.panes[active.focusedPaneId] : undefined;
      if (canvas && pane?.activeItemId) canvas.close(pane.activeItemId);
    },
    /** Replaces the active artifact tab's content in place. */
    updateActive: (content: CanvasContent) => {
      if (!canvas) return false;
      const state = canvas.getState();
      const pane = state.panes[state.focusedPaneId];
      const item = pane?.activeItemId ? state.items[pane.activeItemId] : undefined;
      const data = item ? readArtifactItemData(item.data) : null;
      if (!item || !data) return openContent(content) !== null;
      const next = artifactOpenInput(content, { savedItemId: data.savedItemId });
      return canvas.update(item.id, { data: next.data, title: next.title ?? null });
    },
  };
}

function useCanvasStateSafe(): boolean {
  return useOptionalCanvasState(selectCanvasIsOpen, false);
}

function useActiveContent(): CanvasContent | null {
  const active = useOptionalCanvasState(selectCanvasActiveItem, null);
  const data = active ? readArtifactItemData(active.data) : null;
  return data ? contentOf(data) : null;
}
