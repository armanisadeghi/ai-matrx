"use client";

/**
 * Opener for the `newsWindow` overlay.
 *
 * - `useOpenNewsWindow()` — imperative hook. Call to open with typed options;
 *   returns a handle with a `close()` method.
 * - `<NewsWindowController />` — declarative wrapper. Mount to open,
 *   unmount to close. Equivalent ergonomics to rendering a normal component.
 *
 * Hand-maintained opener — see features/overlays/FEATURE.md.
 */

import { useCallback, useEffect } from "react";
import { useAppDispatch } from "@/lib/redux/hooks";
import { closeOverlay, openOverlay } from "@/lib/redux/slices/overlaySlice";

const OVERLAY_ID = "newsWindow" as const;

export interface OpenNewsWindowOptions {
}

export interface NewsWindowHandle {
  close: () => void;
}

export function useOpenNewsWindow() {
  const dispatch = useAppDispatch();
  return useCallback(
    (opts: OpenNewsWindowOptions = {}): NewsWindowHandle => {
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
export function NewsWindowController(props: OpenNewsWindowOptions): null {
  const open = useOpenNewsWindow();
  useEffect(() => {
    const handle = open(props);
    return () => handle.close();
  }, [open]);
  return null;
}
