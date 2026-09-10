"use client";

/**
 * Opener for the `emailDialogWindow` overlay.
 *
 * - `useOpenEmailDialogWindow()` — imperative hook. Call to open with typed options;
 *   returns a handle with a `close()` method.
 * - `<EmailDialogWindowController />` — declarative wrapper. Mount to open,
 *   unmount to close. Equivalent ergonomics to rendering a normal component.
 *
 * Hand-maintained opener — see features/overlays/FEATURE.md.
 */

import { useCallback, useEffect } from "react";
import { useAppDispatch } from "@/lib/redux/hooks";
import { closeOverlay, openOverlay } from "@/lib/redux/slices/overlaySlice";

const OVERLAY_ID = "emailDialogWindow" as const;

export interface OpenEmailDialogWindowOptions {
  title?: string;
  description?: string;
  submitLabel?: string;
}

export interface EmailDialogWindowHandle {
  close: () => void;
}

export function useOpenEmailDialogWindow() {
  const dispatch = useAppDispatch();
  return useCallback(
    (opts: OpenEmailDialogWindowOptions = {}): EmailDialogWindowHandle => {
      dispatch(
        openOverlay({
          overlayId: OVERLAY_ID,
          data: {
            title: opts.title,
            description: opts.description,
            submitLabel: opts.submitLabel,
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
export function EmailDialogWindowController(props: OpenEmailDialogWindowOptions): null {
  const open = useOpenEmailDialogWindow();
  useEffect(() => {
    const handle = open(props);
    return () => handle.close();
  }, [open, props.title, props.description, props.submitLabel]);
  return null;
}
