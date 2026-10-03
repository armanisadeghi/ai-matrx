"use client";

/**
 * useAutoFocus — the `autoFocus` attribute, minus its two defects: it never
 * scrolls the page, and it never takes the caret from a field the person is
 * typing in elsewhere (`focus-guard.ts`). Use it for a field that mounts
 * WITHOUT the person asking for it right then: a board tile placed by an agent
 * or woken from sleep, a composer whose conversation finished starting.
 *
 * Mount-only (per `enabled` turning on), like the attribute it replaces.
 */

import { useEffect, type RefObject } from "react";
import { focusUnlessTypingElsewhere } from "./focus-guard";

export function useAutoFocus(ref: RefObject<HTMLElement | null>, enabled = true): void {
  useEffect(() => {
    if (enabled) focusUnlessTypingElsewhere(ref.current);
  }, [ref, enabled]);
}
