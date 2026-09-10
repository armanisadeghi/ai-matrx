"use client";

/**
 * Opener for the `quickNotes` overlay.
 *
 * - `useOpenQuickNotesSheet()` — imperative hook. Call to open with typed options;
 *   returns a handle with a `close()` method.
 * - `<QuickNotesSheetController />` — declarative wrapper. Mount to open,
 *   unmount to close. Equivalent ergonomics to rendering a normal component.
 *
 * Hand-maintained opener — see features/overlays/FEATURE.md.
 */

import { useCallback, useEffect } from "react";
import { useAppDispatch } from "@/lib/redux/hooks";
import { closeOverlay, openOverlay } from "@/lib/redux/slices/overlaySlice";

const OVERLAY_ID = "quickNotes" as const;

export interface OpenQuickNotesSheetOptions {
  className?: string;
}

export interface QuickNotesSheetHandle {
  close: () => void;
}

export function useOpenQuickNotesSheet() {
  const dispatch = useAppDispatch();
  return useCallback(
    (opts: OpenQuickNotesSheetOptions = {}): QuickNotesSheetHandle => {
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
export function QuickNotesSheetController(props: OpenQuickNotesSheetOptions): null {
  const open = useOpenQuickNotesSheet();
  useEffect(() => {
    const handle = open(props);
    return () => handle.close();
  }, [open, props.className]);
  return null;
}
