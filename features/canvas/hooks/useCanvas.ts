"use client";

import type { CanvasContent } from "@/features/canvas/canvasContent";
import { useArtifactCanvas } from "@/features/canvas/host/useArtifactCanvas";

/**
 * useCanvas — open CanvasContent in THE canvas (@ai-matrx/canvas).
 *
 * `open` returns whether the canvas took it; a request it cannot honour is
 * ANNOUNCED (`reportCanvasOpenDrop`), never dropped. Opening the same thing
 * twice focuses its existing tab.
 *
 * @example
 *   const { open } = useCanvas();
 *   open({ type: "quiz", data: quizData, metadata: { title: "My Quiz" } });
 */
export function useCanvas() {
  const canvas = useArtifactCanvas();
  return {
    open: (content: CanvasContent): boolean => canvas.openContent(content) !== null,
    close: canvas.hide,
    clear: canvas.clear,
    update: (content: CanvasContent) => {
      canvas.updateActive(content);
    },
    isOpen: canvas.isOpen,
    content: canvas.activeContent,
  };
}

export { useOpenArtifactInCanvas } from "./useOpenArtifactInCanvas";
export { useCanvasOpenGuard } from "./useCanvasOpenGuard";
