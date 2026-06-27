"use client";

/**
 * Opener for the `systemInstructionWindow` overlay.
 *
 * - `useOpenSystemInstructionWindow()` — imperative hook. Call to open with typed
 *   options; returns a handle with a `close()` method.
 * - `<SystemInstructionWindowController />` — declarative wrapper. Mount to open,
 *   unmount to close.
 */

import { useCallback, useEffect } from "react";
import { useAppDispatch } from "@/lib/redux/hooks";
import { closeOverlay, openOverlay } from "@/lib/redux/slices/overlaySlice";

const OVERLAY_ID = "systemInstructionWindow" as const;

export interface OpenSystemInstructionWindowOptions {
  conversationId: string;
}

export interface SystemInstructionWindowHandle {
  close: () => void;
}

export function useOpenSystemInstructionWindow() {
  const dispatch = useAppDispatch();
  return useCallback(
    (
      opts: OpenSystemInstructionWindowOptions,
    ): SystemInstructionWindowHandle => {
      dispatch(
        openOverlay({
          overlayId: OVERLAY_ID,
          data: {
            conversationId: opts.conversationId,
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
 * closes it on unmount.
 */
export function SystemInstructionWindowController(
  props: OpenSystemInstructionWindowOptions,
): null {
  const open = useOpenSystemInstructionWindow();
  useEffect(() => {
    const handle = open(props);
    return () => handle.close();
  }, [open, props.conversationId]);
  return null;
}
