"use client";

/**
 * Opener for the `structuredListManagerV2Window` overlay.
 *
 * - `useOpenStructuredListManagerV2Window()` — imperative hook. Pass `forcedListId`
 *   to open in single-list mode (switcher hidden); omit it to open the full
 *   browse view.
 * - `<StructuredListManagerV2WindowController />` — declarative wrapper. Mount to
 *   open, unmount to close.
 */

import { useCallback, useEffect } from "react";
import { useAppDispatch } from "@/lib/redux/hooks";
import { closeOverlay, openOverlay } from "@/lib/redux/slices/overlaySlice";

const OVERLAY_ID = "structuredListManagerV2Window" as const;

export interface OpenStructuredListManagerV2WindowOptions {
  title?: string;
  /** When set, opens in single-list mode pinned to this picklist. */
  forcedListId?: string | null;
}

export interface StructuredListManagerV2WindowHandle {
  close: () => void;
}

export function useOpenStructuredListManagerV2Window() {
  const dispatch = useAppDispatch();
  return useCallback(
    (
      opts: OpenStructuredListManagerV2WindowOptions = {},
    ): StructuredListManagerV2WindowHandle => {
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

export function StructuredListManagerV2WindowController(
  props: OpenStructuredListManagerV2WindowOptions,
): null {
  const open = useOpenStructuredListManagerV2Window();
  useEffect(() => {
    const handle = open(props);
    return () => handle.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, props.title, props.forcedListId]);
  return null;
}
