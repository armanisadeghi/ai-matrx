"use client";

/**
 * Opener for the `assistsWindow` overlay (a window that wraps a canonical list).
 *
 * - `useOpenAssistsWindow()` — imperative hook; returns a handle with `close()`.
 * - `<AssistsWindowController />` — declarative: mount to open, unmount to close.
 *
 * Hand-maintained opener — see features/overlays/FEATURE.md.
 */

import { useCallback, useEffect } from "react";
import { useAppDispatch } from "@/lib/redux/hooks";
import { closeOverlay, openOverlay } from "@/lib/redux/slices/overlaySlice";

const OVERLAY_ID = "assistsWindow" as const;

export interface AssistsWindowHandle {
  close: () => void;
}

export function useOpenAssistsWindow() {
  const dispatch = useAppDispatch();
  return useCallback((): AssistsWindowHandle => {
    dispatch(openOverlay({ overlayId: OVERLAY_ID }));
    return {
      close: () => dispatch(closeOverlay({ overlayId: OVERLAY_ID })),
    };
  }, [dispatch]);
}

export function AssistsWindowController(): null {
  const open = useOpenAssistsWindow();
  useEffect(() => {
    const handle = open();
    return () => handle.close();
  }, [open]);
  return null;
}
