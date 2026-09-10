"use client";

/**
 * Opener for the `whatsappSettings` overlay.
 *
 * - `useOpenWhatsAppSettingsWindow()` — imperative hook. Call to open with typed options;
 *   returns a handle with a `close()` method.
 * - `<WhatsAppSettingsWindowController />` — declarative wrapper. Mount to open,
 *   unmount to close. Equivalent ergonomics to rendering a normal component.
 *
 * Hand-maintained opener — see features/overlays/FEATURE.md.
 */

import { useCallback, useEffect } from "react";
import { useAppDispatch } from "@/lib/redux/hooks";
import { closeOverlay, openOverlay } from "@/lib/redux/slices/overlaySlice";

const OVERLAY_ID = "whatsappSettings" as const;

export interface OpenWhatsAppSettingsWindowOptions {
  userName?: string;
  userAvatarUrl?: string | null;
  initialNavId?: string;
}

export interface WhatsAppSettingsWindowHandle {
  close: () => void;
}

export function useOpenWhatsAppSettingsWindow() {
  const dispatch = useAppDispatch();
  return useCallback(
    (opts: OpenWhatsAppSettingsWindowOptions = {}): WhatsAppSettingsWindowHandle => {
      dispatch(
        openOverlay({
          overlayId: OVERLAY_ID,
          data: {
            userName: opts.userName,
            userAvatarUrl: opts.userAvatarUrl,
            initialNavId: opts.initialNavId,
          },
        }),
      );
      return {
        close: () => dispatch(closeOverlay({ overlayId: OVERLAY_ID })),
      };
    },
    [dispatch],
  );
}

/**
 * Declarative form. Renders nothing visible; opens the overlay on mount,
 * closes it on unmount. Use this when a caller wants to express overlay
 * state declaratively (the way they'd render a normal component).
 */
export function WhatsAppSettingsWindowController(props: OpenWhatsAppSettingsWindowOptions): null {
  const open = useOpenWhatsAppSettingsWindow();
  useEffect(() => {
    const handle = open(props);
    return () => handle.close();
  }, [open, props.userName, props.userAvatarUrl, props.initialNavId]);
  return null;
}
