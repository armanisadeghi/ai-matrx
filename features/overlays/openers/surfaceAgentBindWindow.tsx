"use client";

/**
 * Opener for the `surfaceAgentBindWindow` overlay.
 *
 * Re-exports the canonical hand-written opener (callback-aware via
 * `onBound` / `onWindowClose`).
 */

import { useEffect } from "react";
import {
  useOpenSurfaceAgentBindWindow,
  type OpenSurfaceAgentBindWindowOptions,
  type SurfaceAgentBindWindowHandle,
} from "@/features/window-panels/windows/surfaces/useOpenSurfaceAgentBindWindow";

export {
  useOpenSurfaceAgentBindWindow,
  type OpenSurfaceAgentBindWindowOptions,
  type SurfaceAgentBindWindowHandle,
};

export function SurfaceAgentBindWindowController(
  props: OpenSurfaceAgentBindWindowOptions,
): null {
  const open = useOpenSurfaceAgentBindWindow();
  useEffect(() => {
    const handle = open(props);
    return () => handle.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, props.surfaceName, props.instanceId]);
  return null;
}
