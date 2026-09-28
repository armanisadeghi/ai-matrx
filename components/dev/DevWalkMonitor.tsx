"use client";

import { useEffect } from "react";

const ACTIVITY_THROTTLE_MS = 15_000;

/**
 * Development preview only. The proxy owns admission; this client merely
 * receives its eviction notice, stops the EventSource, and leaves the app so
 * direct Supabase subscriptions unmount with the page.
 */
export function DevWalkMonitor() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;
    if (new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://clone.invalid").host !== "db.matrxserver.com") return;

    const source = new EventSource("/__dev-walk?stream=1");
    const park = () => {
      source.close();
      const returnTo = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      window.location.replace(`/__dev-walk?parked=1&returnTo=${encodeURIComponent(returnTo)}`);
    };
    source.addEventListener("evicted", park);

    let lastActivityAt = 0;
    const recordActivity = () => {
      const now = Date.now();
      if (now - lastActivityAt < ACTIVITY_THROTTLE_MS) return;
      lastActivityAt = now;
      void fetch("/__dev-walk?activity=1", { method: "POST", credentials: "same-origin" })
        .then((response) => {
          if (response.ok) return;
          if (response.status === 409) {
            park();
            return;
          }
          throw new Error(`walk-cap activity returned HTTP ${response.status}`);
        })
        .catch((error: unknown) => console.error("[walk-cap] Could not record explicit preview activity.", error));
    };
    const events: Array<keyof WindowEventMap> = ["pointerdown", "keydown", "scroll"];
    for (const event of events) window.addEventListener(event, recordActivity, { passive: true, capture: true });

    return () => {
      source.close();
      source.removeEventListener("evicted", park);
      for (const event of events) window.removeEventListener(event, recordActivity, true);
    };
  }, []);

  return null;
}
