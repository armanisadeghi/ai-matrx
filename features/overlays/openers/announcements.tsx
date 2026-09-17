"use client";

/**
 * Opener for the `announcements` overlay.
 *
 * - `useOpenAnnouncementsViewer()` — imperative hook. Call to open with typed options;
 *   returns a handle with a `close()` method.
 * - `<AnnouncementsViewerController />` — declarative wrapper. Mount to open,
 *   unmount to close. Equivalent ergonomics to rendering a normal component.
 *
 * Hand-maintained opener — see features/overlays/FEATURE.md.
 */

import { useCallback, useEffect } from "react";
import { useAppDispatch } from "@/lib/redux/hooks";
import { closeOverlay, openOverlay } from "@/lib/redux/slices/overlaySlice";

const OVERLAY_ID = "announcements" as const;

export interface OpenAnnouncementsViewerOptions {
  /** Open directly to one announcement; omit to show the announcement inbox. */
  initialAnnouncementId?: string;
}

export interface AnnouncementsViewerHandle {
  close: () => void;
}

export function useOpenAnnouncementsViewer() {
  const dispatch = useAppDispatch();
  return useCallback(
    (opts: OpenAnnouncementsViewerOptions = {}): AnnouncementsViewerHandle => {
      dispatch(
        openOverlay({
          overlayId: OVERLAY_ID,
          data: { initialAnnouncementId: opts.initialAnnouncementId ?? null },
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
export function AnnouncementsViewerController(
  props: OpenAnnouncementsViewerOptions,
): null {
  const open = useOpenAnnouncementsViewer();
  useEffect(() => {
    const handle = open(props);
    return () => handle.close();
  }, [open, props.initialAnnouncementId]);
  return null;
}
