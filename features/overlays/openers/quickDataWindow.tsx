"use client";

/**
 * Opener for the `quickDataWindow` overlay.
 *
 * - `useOpenQuickDataWindow()` — imperative hook. Call to open with typed options;
 *   returns a handle with a `close()` method.
 * - `<QuickDataWindowController />` — declarative wrapper. Mount to open,
 *   unmount to close. Equivalent ergonomics to rendering a normal component.
 *
 * Hand-maintained opener — see features/overlays/FEATURE.md.
 */

import { useCallback, useEffect } from "react";
import { useAppDispatch } from "@/lib/redux/hooks";
import { closeOverlay, openOverlay } from "@/lib/redux/slices/overlaySlice";

const OVERLAY_ID = "quickDataWindow" as const;

export interface OpenQuickDataWindowOptions {
  selectedTable?: string | null;
}

export interface QuickDataWindowHandle {
  close: () => void;
}

export function useOpenQuickDataWindow() {
  const dispatch = useAppDispatch();
  return useCallback(
    (opts: OpenQuickDataWindowOptions = {}): QuickDataWindowHandle => {
      dispatch(
        openOverlay({
          overlayId: OVERLAY_ID,
          data: {
            selectedTable: opts.selectedTable,
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
 * closes it on unmount. Use this when a caller wants to express overlay
 * state declaratively (the way they'd render a normal component).
 */
export function QuickDataWindowController(props: OpenQuickDataWindowOptions): null {
  const open = useOpenQuickDataWindow();
  useEffect(() => {
    const handle = open(props);
    return () => handle.close();
  }, [open, props.selectedTable]);
  return null;
}
