"use client";

/**
 * Opener for the `structuredListManagerV1Window` overlay.
 *
 * - `useOpenStructuredListManagerV1Window()` — imperative hook. Pass `forcedListId`
 *   to open in single-list mode (sidebar hidden); omit it to open the full
 *   browse view.
 * - `<StructuredListManagerV1WindowController />` — declarative wrapper. Mount to
 *   open, unmount to close.
 */

import { useCallback, useEffect } from "react";
import { useAppDispatch } from "@/lib/redux/hooks";
import { closeOverlay, openOverlay } from "@/lib/redux/slices/overlaySlice";

const OVERLAY_ID = "structuredListManagerV1Window" as const;

export interface OpenStructuredListManagerV1WindowOptions {
  title?: string;
  /** When set, opens in single-list mode pinned to this picklist. */
  forcedListId?: string | null;
}

export interface StructuredListManagerV1WindowHandle {
  close: () => void;
}

export function useOpenStructuredListManagerV1Window() {
  const dispatch = useAppDispatch();
  return useCallback(
    (
      opts: OpenStructuredListManagerV1WindowOptions = {},
    ): StructuredListManagerV1WindowHandle => {
      dispatch(
        openOverlay({
          overlayId: OVERLAY_ID,
          data: {
            title: opts.title,
            forcedListId: opts.forcedListId ?? null,
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

export function StructuredListManagerV1WindowController(
  props: OpenStructuredListManagerV1WindowOptions,
): null {
  const open = useOpenStructuredListManagerV1Window();
  useEffect(() => {
    const handle = open(props);
    return () => handle.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, props.title, props.forcedListId]);
  return null;
}
