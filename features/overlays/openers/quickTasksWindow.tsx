"use client";

/**
 * Opener for the `quickTasksWindow` overlay.
 *
 * - `useOpenQuickTasksWindow()` — imperative hook. Call to open with typed options;
 *   returns a handle with a `close()` method.
 * - `<QuickTasksWindowController />` — declarative wrapper. Mount to open,
 *   unmount to close. Equivalent ergonomics to rendering a normal component.
 *
 * Hand-maintained opener — see features/overlays/FEATURE.md.
 */

import { useCallback, useEffect } from "react";
import { useAppDispatch } from "@/lib/redux/hooks";
import { closeOverlay, openOverlay } from "@/lib/redux/slices/overlaySlice";

const OVERLAY_ID = "quickTasksWindow" as const;

export interface OpenQuickTasksWindowOptions {
}

export interface QuickTasksWindowHandle {
  close: () => void;
}

export function useOpenQuickTasksWindow() {
  const dispatch = useAppDispatch();
  return useCallback(
    (opts: OpenQuickTasksWindowOptions = {}): QuickTasksWindowHandle => {
      dispatch(openOverlay({ overlayId: OVERLAY_ID }));
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
export function QuickTasksWindowController(props: OpenQuickTasksWindowOptions): null {
  const open = useOpenQuickTasksWindow();
  useEffect(() => {
    const handle = open(props);
    return () => handle.close();
  }, [open]);
  return null;
}
