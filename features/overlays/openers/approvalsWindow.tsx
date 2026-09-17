"use client";

/**
 * Opener for the `approvalsWindow` overlay — THE approval queue as a window.
 *
 * - `useOpenApprovalsWindow()` — imperative hook; returns a handle with `close()`.
 * - `<ApprovalsWindowController />` — declarative: mount to open, unmount to close.
 *
 * Hand-maintained opener — see features/overlays/FEATURE.md.
 */

import { useCallback, useEffect } from "react";
import { useAppDispatch } from "@/lib/redux/hooks";
import { closeOverlay, openOverlay } from "@/lib/redux/slices/overlaySlice";

const OVERLAY_ID = "approvalsWindow" as const;

export interface ApprovalsWindowHandle {
  close: () => void;
}

export function useOpenApprovalsWindow() {
  const dispatch = useAppDispatch();
  return useCallback((): ApprovalsWindowHandle => {
    dispatch(openOverlay({ overlayId: OVERLAY_ID }));
    return {
      close: () => dispatch(closeOverlay({ overlayId: OVERLAY_ID })),
    };
  }, [dispatch]);
}

export function ApprovalsWindowController(): null {
  const open = useOpenApprovalsWindow();
  useEffect(() => {
    const handle = open();
    return () => handle.close();
  }, [open]);
  return null;
}
