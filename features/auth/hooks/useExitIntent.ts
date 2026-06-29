"use client";

import { useEffect, useState } from "react";

const FIRED_SESSION_KEY = "matrx.exitIntent.firedThisSession";

/**
 * Fires once per session when the user's cursor leaves through the top of
 * the viewport — a fair signal they're about to close the tab. The hook
 * latches on first fire and stays `true` until the session ends (page
 * close), so consumers can render an opt-in modal without it re-firing on
 * every cursor wander.
 *
 * Authentication state is intentionally not checked here; the caller
 * decides whether the modal should show (guests yes, authed no). Keeping
 * the hook stateless about identity makes it reusable for other
 * intent-signaling work.
 */
export function useExitIntent(options?: { enabled?: boolean }): boolean {
  const enabled = options?.enabled ?? true;
  const [fired, setFired] = useState(false);

  useEffect(() => {
    if (!enabled) return undefined;
    if (typeof window === "undefined") return undefined;

    if (window.sessionStorage.getItem(FIRED_SESSION_KEY) === "1") {
      // Already shown in this session — don't fire again, don't even bind.
      return undefined;
    }

    const handler = (e: MouseEvent) => {
      // `clientY <= 0` and movement upward indicates the cursor crossed
      // the top edge. We deliberately ignore left/right exits because they
      // can be reaching for the address bar, scrollbar, or another tab —
      // not a clear close signal.
      if (e.clientY <= 0 && e.relatedTarget === null) {
        window.sessionStorage.setItem(FIRED_SESSION_KEY, "1");
        setFired(true);
      }
    };

    document.addEventListener("mouseout", handler);
    return () => document.removeEventListener("mouseout", handler);
  }, [enabled]);

  return fired;
}
