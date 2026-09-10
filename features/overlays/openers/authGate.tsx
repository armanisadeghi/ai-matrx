"use client";

/**
 * Opener for the `authGate` overlay.
 *
 * - `useOpenAuthGateDialog()` — imperative hook. Call to open with typed options;
 *   returns a handle with a `close()` method.
 * - `<AuthGateDialogController />` — declarative wrapper. Mount to open,
 *   unmount to close. Equivalent ergonomics to rendering a normal component.
 *
 * Hand-maintained opener — see features/overlays/FEATURE.md.
 */

import { useCallback, useEffect } from "react";
import { useAppDispatch } from "@/lib/redux/hooks";
import { closeOverlay, openOverlay } from "@/lib/redux/slices/overlaySlice";

const OVERLAY_ID = "authGate" as const;

export interface OpenAuthGateDialogOptions {
  featureName?: string;
  featureDescription?: string;
}

export interface AuthGateDialogHandle {
  close: () => void;
}

export function useOpenAuthGateDialog() {
  const dispatch = useAppDispatch();
  return useCallback(
    (opts: OpenAuthGateDialogOptions = {}): AuthGateDialogHandle => {
      dispatch(
        openOverlay({
          overlayId: OVERLAY_ID,
          data: {
            featureName: opts.featureName,
            featureDescription: opts.featureDescription,
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
export function AuthGateDialogController(props: OpenAuthGateDialogOptions): null {
  const open = useOpenAuthGateDialog();
  useEffect(() => {
    const handle = open(props);
    return () => handle.close();
  }, [open, props.featureName, props.featureDescription]);
  return null;
}
