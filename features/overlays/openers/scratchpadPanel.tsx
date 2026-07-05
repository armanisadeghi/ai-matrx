"use client";

/**
 * Opener for the `scratchpadPanel` overlay — the user's GLOBAL scratchpad in a
 * NON-BLOCKING, resizable RIGHT SIDEBAR (SidePanelSurface), reachable from the
 * Quick Actions menu on every page. Click → opens → type → close: the active
 * scratchpad follows the user everywhere and is auto-attached (read-only) to
 * every conversation's agent context when it has content.
 *
 * - `useOpenScratchpadPanel()` — imperative hook; returns a `close()` handle.
 * - `<ScratchpadPanelController />` — declarative wrapper.
 *
 * Singleton: one right sidebar; reopening focuses the same panel.
 */

import { useCallback, useEffect } from "react";
import { useAppDispatch } from "@/lib/redux/hooks";
import { closeOverlay, openOverlay } from "@/lib/redux/slices/overlaySlice";

const OVERLAY_ID = "scratchpadPanel" as const;

export interface ScratchpadPanelHandle {
  close: () => void;
}

export function useOpenScratchpadPanel() {
  const dispatch = useAppDispatch();
  return useCallback((): ScratchpadPanelHandle => {
    dispatch(openOverlay({ overlayId: OVERLAY_ID }));
    return {
      close: () => dispatch(closeOverlay({ overlayId: OVERLAY_ID })),
    };
  }, [dispatch]);
}

/**
 * Declarative form. Renders nothing visible; opens the overlay on mount,
 * closes it on unmount.
 */
export function ScratchpadPanelController(): null {
  const open = useOpenScratchpadPanel();
  useEffect(() => {
    const handle = open();
    return () => handle.close();
  }, [open]);
  return null;
}
