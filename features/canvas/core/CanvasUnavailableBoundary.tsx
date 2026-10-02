"use client";

import { createContext, useContext, type ReactNode } from "react";

/**
 * Marks the global side canvas unavailable for everything rendered inside it,
 * while an immersive canvas viewer already owns the viewport. This keeps
 * nested artifact renderers from advertising an impossible second "Open in
 * canvas" action — `useCanvasOpenGuard` reads it, so every opener and every
 * "Open in canvas" control below this boundary sees no canvas.
 *
 * Scoped to its subtree (a context), so the rest of the page keeps its canvas.
 */
const CanvasSuppressedContext = createContext(false);

export function CanvasUnavailableBoundary({ children }: { children: ReactNode }) {
  return (
    <CanvasSuppressedContext.Provider value={true}>
      {children}
    </CanvasSuppressedContext.Provider>
  );
}

/** True inside a `CanvasUnavailableBoundary`. */
export function useCanvasSuppressed(): boolean {
  return useContext(CanvasSuppressedContext);
}
