"use client";

/**
 * Opener for the `surfaceContextInspector` overlay — the live surface
 * value-contract inspector (declared SurfaceValues vs the resolved scope).
 *
 * Data-only: surfaceName + the resolved scope + isEditable are plain
 * serializable values, so they travel straight through `openOverlay` data.
 * Mirrors `contextAssignment` / `findReplace`.
 *
 * - `useOpenSurfaceContextInspector()` — imperative hook; returns a `close()` handle.
 * - `<SurfaceContextInspectorController />` — declarative wrapper.
 */

import { useCallback, useEffect } from "react";
import { useAppDispatch } from "@/lib/redux/hooks";
import { closeOverlay, openOverlay } from "@/lib/redux/slices/overlaySlice";

const OVERLAY_ID = "surfaceContextInspector" as const;

export interface OpenSurfaceContextInspectorOptions {
  surfaceName: string | null;
  /** The live resolved ApplicationScope the menu acts on. */
  scope: Record<string, unknown>;
  isEditable: boolean;
}

export interface SurfaceContextInspectorHandle {
  close: () => void;
}

export function useOpenSurfaceContextInspector() {
  const dispatch = useAppDispatch();
  return useCallback(
    (
      opts: OpenSurfaceContextInspectorOptions,
    ): SurfaceContextInspectorHandle => {
      dispatch(
        openOverlay({
          overlayId: OVERLAY_ID,
          data: {
            surfaceName: opts.surfaceName,
            scope: opts.scope,
            isEditable: opts.isEditable,
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
 * Declarative form. Renders nothing visible; opens on mount, closes on unmount.
 */
export function SurfaceContextInspectorController(
  props: OpenSurfaceContextInspectorOptions,
): null {
  const open = useOpenSurfaceContextInspector();
  useEffect(() => {
    const handle = open(props);
    return () => handle.close();
  }, [open, props.surfaceName, props.scope, props.isEditable]);
  return null;
}
