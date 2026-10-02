"use client";

/**
 * The ONE listener for the server's `guest_ai_allowance_used` refusal.
 *
 * The shared error sink (`captureError`) notices the refusal on every AI
 * request and stream (lib/guest/guest-ai-allowance.ts); this bridge turns that
 * into the one reminder overlay. Mounted once, in app/Providers.tsx, so every
 * route group inherits it. Renders nothing.
 */

import { useEffect } from "react";
import { onGuestAiAllowanceUsed } from "@/lib/guest/guest-ai-allowance";
import { useOpenGuestAiAllowance } from "@/features/overlays/openers/guestAiAllowance";

export function GuestAiAllowanceBridge(): null {
  const openReminder = useOpenGuestAiAllowance();
  useEffect(
    () =>
      onGuestAiAllowanceUsed((refusal) => {
        // Singleton overlay: a burst of refusals (HTTP + stream for one send)
        // re-opens the same reminder, never a second one.
        openReminder({ message: refusal.message });
      }),
    [openReminder],
  );
  return null;
}
