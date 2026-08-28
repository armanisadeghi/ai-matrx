"use client";

/**
 * Opener for the `googleConnectWindow` overlay.
 *
 * Call this from ANYWHERE the user runs into Google and has not connected it —
 * the resource picker, a connector strip under the input, an export menu. The
 * window comes up over the page instead of sending them to settings, which is
 * the whole point of it existing.
 */

import { useCallback, useEffect, useRef } from "react";
import { useAppDispatch } from "@/lib/redux/hooks";
import { closeOverlay, openOverlay } from "@/lib/redux/slices/overlaySlice";
import {
  createGoogleConnectCallbackGroup,
  type GoogleConnectWindowHandlers,
} from "@/features/window-panels/windows/google/callbacks";

const OVERLAY_ID = "googleConnectWindow" as const;

export interface OpenGoogleConnectOptions extends GoogleConnectWindowHandlers {
  /** One line saying why, e.g. "to attach a doc to this message". */
  reason?: string;
  /** Workspace keeps live Docs/Sheets; import returns ordinary browser Files. */
  mode?: "workspace" | "drive-import";
}

export interface GoogleConnectWindowHandle {
  close: () => void;
  dispose: () => void;
}

export function useOpenGoogleConnectWindow() {
  const dispatch = useAppDispatch();
  const disposersRef = useRef<Set<() => void>>(new Set());

  useEffect(() => {
    const disposers = disposersRef.current;
    return () => {
      for (const dispose of disposers) dispose();
      disposers.clear();
    };
  }, []);

  return useCallback(
    (options?: OpenGoogleConnectOptions): GoogleConnectWindowHandle => {
      const callbacks =
        options?.onDriveImported || options?.onWindowClose
          ? createGoogleConnectCallbackGroup({
              onDriveImported: options.onDriveImported,
              onWindowClose: options.onWindowClose,
            })
          : null;
      if (callbacks) disposersRef.current.add(callbacks.dispose);
      dispatch(
        openOverlay({
          overlayId: OVERLAY_ID,
          data: {
            reason: options?.reason ?? null,
            mode: options?.mode ?? "workspace",
            callbackGroupId: callbacks?.callbackGroupId ?? null,
          },
        }),
      );
      const dispose = () => {
        callbacks?.dispose();
        if (callbacks) disposersRef.current.delete(callbacks.dispose);
      };
      return {
        close: () => {
          dispatch(closeOverlay({ overlayId: OVERLAY_ID }));
          dispose();
        },
        dispose,
      };
    },
    [dispatch],
  );
}
