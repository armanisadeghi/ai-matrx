"use client";

import type { CanvasContent } from "@/features/canvas/canvasContent";
import { useArtifactCanvasActions, type ArtifactCanvasActions } from "@/features/canvas/host/useArtifactCanvas";

export interface CanvasOpener {
  /** Opens content; false when the canvas could not take it (announced, never silent). */
  open: (content: CanvasContent) => boolean;
  /** Puts the canvas away. */
  close: () => void;
  /** Closes every tab and puts the canvas away. */
  clear: () => void;
  /** Replaces the active artifact tab's content in place. */
  update: (content: CanvasContent) => void;
}

/**
 * useCanvas — open CanvasContent in THE canvas (@ai-matrx/canvas).
 *
 * `open` returns whether the canvas took it; a request it cannot honour is
 * ANNOUNCED (`reportCanvasOpenDrop`), never dropped. Opening the same thing
 * twice focuses its existing tab.
 *
 * Subscribes to NOTHING: every code block and rich block calls this, so a
 * subscription here re-rendered all of them on each canvas open, hide and tab
 * switch. A component that shows canvas state reads `useArtifactCanvas()`.
 *
 * @example
 *   const { open } = useCanvas();
 *   open({ type: "quiz", data: quizData, metadata: { title: "My Quiz" } });
 */
export function useCanvas(): CanvasOpener {
  const actions = useArtifactCanvasActions();
  let opener = OPENERS.get(actions);
  if (!opener) {
    opener = openerFor(actions);
    OPENERS.set(actions, opener);
  }
  return opener;
}

// Keyed by the actions object, which is one per controller (and one for "no canvas").
const OPENERS = new WeakMap<ArtifactCanvasActions, CanvasOpener>();

function openerFor(actions: ArtifactCanvasActions): CanvasOpener {
  return {
    open: (content) => actions.openContent(content) !== null,
    close: actions.hide,
    clear: actions.clear,
    update: (content) => {
      actions.updateActive(content);
    },
  };
}

export { useOpenArtifactInCanvas } from "./useOpenArtifactInCanvas";
export { useCanvasOpenGuard } from "./useCanvasOpenGuard";
