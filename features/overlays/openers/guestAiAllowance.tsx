"use client";

/**
 * Opener for the `guestAiAllowance` overlay — THE one guest reminder.
 *
 * Nothing in a feature calls this. The ONE caller is
 * `components/guest/GuestAiAllowanceBridge.tsx`, which listens to the shared
 * error sink (lib/guest/guest-ai-allowance.ts) and opens it when the server
 * answers `guest_ai_allowance_used`.
 *
 * Hand-maintained opener — see features/overlays/FEATURE.md.
 */

import { useCallback, useEffect } from "react";
import { useAppDispatch } from "@/lib/redux/hooks";
import { closeOverlay, openOverlay } from "@/lib/redux/slices/overlaySlice";

const OVERLAY_ID = "guestAiAllowance" as const;

export interface OpenGuestAiAllowanceOptions {
  /** The server's own sentence, when it sent one. */
  message?: string | null;
}

export interface GuestAiAllowanceHandle {
  close: () => void;
}

export function useOpenGuestAiAllowance() {
  const dispatch = useAppDispatch();
  return useCallback(
    (opts: OpenGuestAiAllowanceOptions = {}): GuestAiAllowanceHandle => {
      dispatch(
        openOverlay({
          overlayId: OVERLAY_ID,
          data: { message: opts.message ?? null },
        }),
      );
      return {
        close: () => dispatch(closeOverlay({ overlayId: OVERLAY_ID })),
      };
    },
    [dispatch],
  );
}

/** Declarative form: opens on mount, closes on unmount. */
export function GuestAiAllowanceController(
  props: OpenGuestAiAllowanceOptions,
): null {
  const open = useOpenGuestAiAllowance();
  useEffect(() => {
    const handle = open(props);
    return () => handle.close();
  }, [open, props.message]);
  return null;
}
