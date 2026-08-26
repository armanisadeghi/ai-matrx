"use client";

/**
 * THE HEADER-ACTIONS SLOT — lets deep content place its small controls in its
 * host tile's HEADER line instead of spending a body row on them.
 *
 * Arman (2026-08-26, Study Pack run page): "the preview versus JSON is
 * sitting outside of the component, but not in the header section as tiny
 * buttons as they should be. Instead, they're giant buttons wasting all of
 * the most valuable user interface space." The header row already exists and
 * already has dead space to the right of the title; the controls belong
 * there.
 *
 * Mechanics: the HOST (a run-surface tile, a deliverable card) renders
 * `<TileActionsTarget/>` inside its header and wraps its body in
 * `<TileActionsProvider>`. Body content (StructuredValueTabs) portals its
 * controls into the target when one exists, and renders them inline —
 * compactly — when it doesn't, so every non-tile surface keeps working with
 * zero changes.
 */

import React, {
  createContext,
  useContext,
  useState,
} from "react";
import { createPortal } from "react-dom";

const TileActionsContext = createContext<HTMLElement | null>(null);

export function TileActionsProvider({
  target,
  children,
}: {
  target: HTMLElement | null;
  children: React.ReactNode;
}) {
  return (
    <TileActionsContext.Provider value={target}>
      {children}
    </TileActionsContext.Provider>
  );
}

/** The header-side mount point. Renders nothing visible of its own. */
export function useTileActionsTarget(): {
  target: HTMLElement | null;
  targetProps: { ref: (el: HTMLElement | null) => void };
} {
  const [el, setEl] = useState<HTMLElement | null>(null);
  return { target: el, targetProps: { ref: setEl } };
}

/**
 * Render `children` into the host tile's header slot when one is provided,
 * inline otherwise. The one seam every in-body control row uses.
 */
export function IntoTileActions({ children }: { children: React.ReactNode }) {
  const target = useContext(TileActionsContext);
  if (target) return createPortal(children, target);
  return <>{children}</>;
}

/** True when a header slot exists (content can drop its inline reserved row). */
export function useHasTileActionsSlot(): boolean {
  return useContext(TileActionsContext) !== null;
}
