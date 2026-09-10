"use client";

/**
 * Opener for the `galleryWindow` overlay.
 *
 * - `useOpenGalleryWindow()` — imperative hook. Call to open with typed options;
 *   returns a handle with a `close()` method.
 * - `<GalleryWindowController />` — declarative wrapper. Mount to open,
 *   unmount to close. Equivalent ergonomics to rendering a normal component.
 *
 * Hand-maintained opener — see features/overlays/FEATURE.md.
 */

import { useCallback, useEffect } from "react";
import { useAppDispatch } from "@/lib/redux/hooks";
import { closeOverlay, openOverlay } from "@/lib/redux/slices/overlaySlice";

const OVERLAY_ID = "galleryWindow" as const;

export interface OpenGalleryWindowOptions {
}

export interface GalleryWindowHandle {
  close: () => void;
}

export function useOpenGalleryWindow() {
  const dispatch = useAppDispatch();
  return useCallback(
    (opts: OpenGalleryWindowOptions = {}): GalleryWindowHandle => {
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
export function GalleryWindowController(props: OpenGalleryWindowOptions): null {
  const open = useOpenGalleryWindow();
  useEffect(() => {
    const handle = open(props);
    return () => handle.close();
  }, [open]);
  return null;
}
