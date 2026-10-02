"use client";

/**
 * Places the canvas column on the right edge of the window and tells the rest
 * of the page how wide it is. The shell root (and the public/link layouts)
 * read `--shell-canvas-w` and shrink by exactly that much, so the canvas owns
 * its own strip of the top edge and never sits over the header or the page.
 * Full screen keeps that inset: the column grows OVER the app, which hides
 * once the slide ends (`data-canvas-fullscreen` on <html>). Every change
 * moves on the package's motion contract (canvas-host.css).
 */

import "@ai-matrx/canvas/styles.css";
import "@ai-matrx/canvas/tokens.css";
import "./canvas-host.css";
import { useEffect } from "react";
import { CanvasColumn, useCanvasColumnWidth } from "@ai-matrx/canvas/react";
import { SurfaceRuntimeProvider } from "@ai-matrx/chat/surfaces/runtime/SurfaceRuntimeContext";
import { CANVAS_SURFACE_NAME } from "@/features/surfaces/manifests/canvas.manifest";
import { useCanvasSurfaceScope } from "./canvasSurfaceScope";

export function ShellCanvasColumn() {
  const width = useCanvasColumnWidth();
  const getScope = useCanvasSurfaceScope();

  useEffect(() => {
    const root = document.documentElement;
    if (width === null) {
      // Expanded: the docked inset stays, so the app does not squeeze while the column grows over it.
      root.setAttribute("data-canvas-fullscreen", "");
    } else {
      root.style.setProperty("--shell-canvas-w", `${width}px`);
      root.removeAttribute("data-canvas-fullscreen");
    }
    root.toggleAttribute("data-canvas-open", width !== 0);
  }, [width]);

  useEffect(
    () => () => {
      const root = document.documentElement;
      root.style.removeProperty("--shell-canvas-w");
      root.removeAttribute("data-canvas-fullscreen");
      root.removeAttribute("data-canvas-open");
    },
    [],
  );

  return (
    <SurfaceRuntimeProvider surfaceName={CANVAS_SURFACE_NAME} getScope={getScope}>
      <CanvasColumn
        className="shell-canvas-column"
        onLiveWidth={(live) => {
          // The page follows the edge while it is dragged; the stored width takes over on release.
          if (live !== null) document.documentElement.style.setProperty("--shell-canvas-w", `${live}px`);
        }}
      />
    </SurfaceRuntimeProvider>
  );
}
