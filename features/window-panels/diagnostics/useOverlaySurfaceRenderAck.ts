"use client";

import { useEffect } from "react";
import {
  ackOverlaySurfaceRender,
  clearOverlaySurfaceRender,
} from "./overlayRenderWatchdog";

/**
 * Acknowledge a visible presentation that intentionally replaces WindowPanel.
 *
 * Registered singleton window overlays normally prove visibility by mounting a
 * WindowPanel and registering geometry. Mobile drawers, sheets, and full-screen
 * viewers have no window-manager geometry, so their composition root must use
 * this hook while that alternate surface is active.
 */
export function useOverlaySurfaceRenderAck(
  overlayId: string,
  active: boolean,
): void {
  useEffect(() => {
    if (!active) return undefined;
    ackOverlaySurfaceRender(overlayId);
    return () => clearOverlaySurfaceRender(overlayId);
  }, [active, overlayId]);
}
