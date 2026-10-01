"use client";

// lib/entity-list/usePhoneWidth.ts
//
// True below the primitive's `sm` breakpoint (640 px) — where MatrxDataTable swaps its table for
// stacked cards (`mobileCardsBreakpoint = "sm"`). Not `useIsMobile` (767 px): the list shell's
// layout follows the table's own breakpoint, so a 700 px window still gets the table and its
// controls. Server and first client render answer false (hydration-safe); the list's rows arrive
// after mount, so nothing rendered on the server changes shape.

import { useSyncExternalStore } from "react";

export const PHONE_WIDTH_QUERY = "(max-width: 639px)";

const hasMatchMedia = () => typeof window !== "undefined" && typeof window.matchMedia === "function";

function subscribe(onChange: () => void) {
  if (!hasMatchMedia()) return () => {};
  const mq = window.matchMedia(PHONE_WIDTH_QUERY);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

export function usePhoneWidth(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => (hasMatchMedia() ? window.matchMedia(PHONE_WIDTH_QUERY).matches : false),
    () => false,
  );
}
