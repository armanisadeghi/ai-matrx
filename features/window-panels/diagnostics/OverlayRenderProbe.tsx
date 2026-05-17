"use client";

import { useEffect } from "react";
import { markRendered } from "@/lib/redux/middleware/overlayDiagnostics";

/**
 * Sits inside the lazy-rendered overlay component tree and signals
 * "this overlay actually mounted" to the diagnostics middleware. Without it,
 * the middleware can't distinguish a successful render from a silent failure.
 *
 * Mount = success. Unmount is meaningful for resource cleanup but the
 * middleware uses `closeOverlay` for that — re-entering this probe on a
 * reopen is what re-marks the slot as rendered.
 */
export function OverlayRenderProbe({
  overlayId,
  instanceId,
}: {
  overlayId: string;
  instanceId: string;
}): null {
  useEffect(() => {
    markRendered(overlayId, instanceId);
  }, [overlayId, instanceId]);
  return null;
}
