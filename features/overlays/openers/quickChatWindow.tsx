"use client";

/**
 * Opener for the `quickChatWindow` overlay.
 *
 * - `useOpenQuickChatSheet()` — imperative hook. Call to open with typed options;
 *   returns a handle with a `close()` method.
 * - `<QuickChatSheetController />` — declarative wrapper. Mount to open,
 *   unmount to close. Equivalent ergonomics to rendering a normal component.
 *
 * Hand-maintained opener — see features/overlays/FEATURE.md.
 */

import { useCallback, useEffect } from "react";
import { useAppDispatch } from "@/lib/redux/hooks";
import { closeOverlay, openOverlay } from "@/lib/redux/slices/overlaySlice";

const OVERLAY_ID = "quickChatWindow" as const;

export interface OpenQuickChatSheetOptions {
  className?: string;
}

export interface QuickChatSheetHandle {
  close: () => void;
}

export function useOpenQuickChatSheet() {
  const dispatch = useAppDispatch();
  return useCallback(
    (opts: OpenQuickChatSheetOptions = {}): QuickChatSheetHandle => {
      dispatch(
        openOverlay({
          overlayId: OVERLAY_ID,
          data: {
            className: opts.className,
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
export function QuickChatSheetController(props: OpenQuickChatSheetOptions): null {
  const open = useOpenQuickChatSheet();
  useEffect(() => {
    const handle = open(props);
    return () => handle.close();
  }, [open, props.className]);
  return null;
}
