"use client";

/**
 * Opener for the `listManagerWindow` overlay.
 *
 * - `useOpenListManagerWindow()` — imperative hook. Call to open with typed options;
 *   returns a handle with a `close()` method.
 * - `<ListManagerWindowController />` — declarative wrapper. Mount to open,
 *   unmount to close. Equivalent ergonomics to rendering a normal component.
 *
 * Hand-maintained opener — see features/overlays/FEATURE.md.
 */

import { useCallback, useEffect } from "react";
import { useAppDispatch } from "@/lib/redux/hooks";
import { closeOverlay, openOverlay } from "@/lib/redux/slices/overlaySlice";

const OVERLAY_ID = "listManagerWindow" as const;

export interface OpenListManagerWindowOptions {
  title?: string;
}

export interface ListManagerWindowHandle {
  close: () => void;
}

export function useOpenListManagerWindow() {
  const dispatch = useAppDispatch();
  return useCallback(
    (opts: OpenListManagerWindowOptions = {}): ListManagerWindowHandle => {
      dispatch(
        openOverlay({
          overlayId: OVERLAY_ID,
          data: {
            title: opts.title,
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
export function ListManagerWindowController(props: OpenListManagerWindowOptions): null {
  const open = useOpenListManagerWindow();
  useEffect(() => {
    const handle = open(props);
    return () => handle.close();
  }, [open, props.title]);
  return null;
}
