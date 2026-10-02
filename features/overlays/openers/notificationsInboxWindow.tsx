"use client";

/**
 * Opener for the `notificationsInboxWindow` overlay (a window that wraps a canonical list).
 *
 * - `useOpenNotificationsInboxWindow()` — imperative hook; returns a handle with `close()`.
 * - `<NotificationsInboxWindowController />` — declarative: mount to open, unmount to close.
 *
 * Hand-maintained opener — see features/overlays/FEATURE.md.
 */

import { useCallback, useEffect } from "react";
import { useAppDispatch } from "@/lib/redux/hooks";
import { closeOverlay, openOverlay } from "@/lib/redux/slices/overlaySlice";

const OVERLAY_ID = "notificationsInboxWindow" as const;

export interface NotificationsInboxWindowHandle {
  close: () => void;
}

export function useOpenNotificationsInboxWindow() {
  const dispatch = useAppDispatch();
  return useCallback((): NotificationsInboxWindowHandle => {
    dispatch(openOverlay({ overlayId: OVERLAY_ID }));
    return {
      close: () => dispatch(closeOverlay({ overlayId: OVERLAY_ID })),
    };
  }, [dispatch]);
}

export function NotificationsInboxWindowController(): null {
  const open = useOpenNotificationsInboxWindow();
  useEffect(() => {
    const handle = open();
    return () => handle.close();
  }, [open]);
  return null;
}
