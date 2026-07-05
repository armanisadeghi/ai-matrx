"use client";

/**
 * Opener for the `agentMemoryWindow` overlay.
 *
 * - `useOpenAgentMemoryWindow()` — imperative hook. Call to open; returns a
 *   handle with a `close()` method.
 * - `<AgentMemoryWindowController />` — declarative wrapper. Mount to open,
 *   unmount to close.
 */

import { useCallback, useEffect } from "react";
import { useAppDispatch } from "@/lib/redux/hooks";
import { closeOverlay, openOverlay } from "@/lib/redux/slices/overlaySlice";

const OVERLAY_ID = "agentMemoryWindow" as const;

export interface AgentMemoryWindowHandle {
  close: () => void;
}

export function useOpenAgentMemoryWindow() {
  const dispatch = useAppDispatch();
  return useCallback((): AgentMemoryWindowHandle => {
    dispatch(openOverlay({ overlayId: OVERLAY_ID, data: {} }));
    return {
      close: () => dispatch(closeOverlay({ overlayId: OVERLAY_ID })),
    };
  }, [dispatch]);
}

/**
 * Declarative form. Renders nothing visible; opens the overlay on mount,
 * closes it on unmount.
 */
export function AgentMemoryWindowController(): null {
  const open = useOpenAgentMemoryWindow();
  useEffect(() => {
    const handle = open();
    return () => handle.close();
  }, [open]);
  return null;
}
