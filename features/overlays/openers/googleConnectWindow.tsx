"use client";

/**
 * Opener for the `googleConnectWindow` overlay.
 *
 * Call this from ANYWHERE the user runs into Google and has not connected it —
 * the resource picker, a connector strip under the input, an export menu. The
 * window comes up over the page instead of sending them to settings, which is
 * the whole point of it existing.
 */

import { useCallback } from "react";
import { useAppDispatch } from "@/lib/redux/hooks";
import { closeOverlay, openOverlay } from "@/lib/redux/slices/overlaySlice";

const OVERLAY_ID = "googleConnectWindow" as const;

export interface OpenGoogleConnectOptions {
  /** One line saying why, e.g. "to attach a doc to this message". */
  reason?: string;
}

export interface GoogleConnectWindowHandle {
  close: () => void;
}

export function useOpenGoogleConnectWindow() {
  const dispatch = useAppDispatch();
  return useCallback(
    (options?: OpenGoogleConnectOptions): GoogleConnectWindowHandle => {
      dispatch(
        openOverlay({
          overlayId: OVERLAY_ID,
          data: { reason: options?.reason ?? null },
        }),
      );
      return {
        close: () => dispatch(closeOverlay({ overlayId: OVERLAY_ID })),
      };
    },
    [dispatch],
  );
}
