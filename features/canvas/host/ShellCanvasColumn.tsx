"use client";

/**
 * Places the canvas column on the right edge of the window and tells the rest
 * of the page how wide it is. The shell root (and the public/link layouts)
 * read `--shell-canvas-w` and shrink by exactly that much, so the canvas owns
 * its own strip of the top edge and never sits over the header or the page.
 * Full screen hides the app (`data-canvas-fullscreen` on <html>).
 */

import "@ai-matrx/canvas/styles.css";
import "./canvas-host.css";
import { useEffect } from "react";
import { CanvasColumn, useCanvasColumnWidth } from "@ai-matrx/canvas/react";

export function ShellCanvasColumn() {
  const width = useCanvasColumnWidth();

  useEffect(() => {
    const root = document.documentElement;
    if (width === null) {
      root.style.setProperty("--shell-canvas-w", "100vw");
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

  return <CanvasColumn className="shell-canvas-column" />;
}
