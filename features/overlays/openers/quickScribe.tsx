"use client";

/**
 * Opener for the `quickScribe` overlay — the global voice-capture slide-in.
 *
 * - `useOpenQuickScribeSheet()` — imperative hook. Call to open with typed
 *   options; returns a handle with a `close()` method.
 * - `<QuickScribeSheetController />` — declarative wrapper. Mount to open,
 *   unmount to close.
 */

import { useCallback, useEffect } from "react";
import { useAppDispatch } from "@/lib/redux/hooks";
import { closeOverlay, openOverlay } from "@/lib/redux/slices/overlaySlice";

const OVERLAY_ID = "quickScribe" as const;

export interface OpenQuickScribeSheetOptions {
  /** Resume an existing Scribe session instead of minting one. */
  sessionId?: string;
}

export interface QuickScribeSheetHandle {
  close: () => void;
}

export function useOpenQuickScribeSheet() {
  const dispatch = useAppDispatch();
  return useCallback(
    (opts: OpenQuickScribeSheetOptions = {}): QuickScribeSheetHandle => {
      dispatch(
        openOverlay({
          overlayId: OVERLAY_ID,
          data: { sessionId: opts.sessionId },
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
 * Declarative form. Renders nothing; opens the overlay on mount, closes on
 * unmount.
 */
export function QuickScribeSheetController(
  props: OpenQuickScribeSheetOptions,
): null {
  const open = useOpenQuickScribeSheet();
  useEffect(() => {
    const handle = open(props);
    return () => handle.close();
  }, [open, props.sessionId]);
  return null;
}
