"use client";

/**
 * Opener for the `instanceUIStateWindow` overlay.
 *
 * - `useOpenInstanceUIStateWindow()` — imperative hook. Call to open with typed options;
 *   returns a handle with a `close()` method.
 * - `<InstanceUIStateWindowController />` — declarative wrapper. Mount to open,
 *   unmount to close. Equivalent ergonomics to rendering a normal component.
 *
 * Hand-maintained opener — see features/overlays/FEATURE.md.
 */

import { useCallback, useEffect } from "react";
import { useAppDispatch } from "@/lib/redux/hooks";
import { closeOverlay, openOverlay } from "@/lib/redux/slices/overlaySlice";

const OVERLAY_ID = "instanceUIStateWindow" as const;

export interface OpenInstanceUIStateWindowOptions {
  initialConversationId?: string | null;
}

export interface InstanceUIStateWindowHandle {
  close: () => void;
}

export function useOpenInstanceUIStateWindow() {
  const dispatch = useAppDispatch();
  return useCallback(
    (opts: OpenInstanceUIStateWindowOptions = {}): InstanceUIStateWindowHandle => {
      dispatch(
        openOverlay({
          overlayId: OVERLAY_ID,
          data: {
            initialConversationId: opts.initialConversationId,
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
export function InstanceUIStateWindowController(props: OpenInstanceUIStateWindowOptions): null {
  const open = useOpenInstanceUIStateWindow();
  useEffect(() => {
    const handle = open(props);
    return () => handle.close();
  }, [open, props.initialConversationId]);
  return null;
}
