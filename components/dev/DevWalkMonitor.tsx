"use client";

import { useEffect } from "react";

const ACTIVITY_THROTTLE_MS = 15_000;

export interface DevWalkMonitorDeps {
  window: Window;
  EventSource: typeof EventSource;
  fetch: typeof fetch;
  park?: (returnTo: string) => void;
}

/** Small injectable core so the real unload path is forcing-testable. */
export function installDevWalkMonitor(deps: DevWalkMonitorDeps): () => void {
  const source = new deps.EventSource("/__dev-walk?stream=1");
  const park = () => {
    source.close();
    // NOTHING FAILS SILENTLY (lane FIRST-PAGE-ABORT, 2026-10-08): a walk the cap evicted mid-load used
    // to leave only React's "Transition was aborted because of invalid state" and a page with no rows
    // behind it, which two lanes read as a table-page fault. Say what is happening, in the console and
    // on the document, before leaving; the parked page then carries the Resume button.
    console.warn(
      "[walk-cap] This preview host was evicted (paused) to free a live-database slot for another session. " +
        "The page is about to unload into the Resume page; an abort or empty table seen after this line is the pause, not an app fault.",
    );
    deps.window.document.documentElement.setAttribute("data-matrx-walk-parked", "evicted");
    const returnTo = `${deps.window.location.pathname}${deps.window.location.search}${deps.window.location.hash}`;
    (deps.park ?? ((target) => deps.window.location.replace(target)))(`/__dev-walk?parked=1&returnTo=${encodeURIComponent(returnTo)}`);
  };
  source.addEventListener("evicted", park);

  let lastActivityAt = 0;
  const recordActivity = () => {
    const now = Date.now();
    if (now - lastActivityAt < ACTIVITY_THROTTLE_MS) return;
    lastActivityAt = now;
    void deps.fetch("/__dev-walk?activity=1", { method: "POST", credentials: "same-origin" })
      .then((response) => {
        if (response.ok) return;
        if (response.status === 409 && response.headers.get("x-matrx-walk-cap") === "evicted") {
          park();
          return;
        }
        throw new Error(`walk-cap activity returned HTTP ${response.status}`);
      })
      .catch((error: unknown) => console.error("[walk-cap] Could not record explicit preview activity.", error));
  };
  const events: Array<keyof WindowEventMap> = ["pointerdown", "keydown", "scroll"];
  for (const event of events) deps.window.addEventListener(event, recordActivity, { passive: true, capture: true });

  return () => {
    source.close();
    source.removeEventListener("evicted", park);
    for (const event of events) deps.window.removeEventListener(event, recordActivity, true);
  };
}

/**
 * Development preview only. The proxy owns admission; this client merely
 * receives its eviction notice, stops the EventSource, and leaves the app so
 * direct Supabase subscriptions unmount with the page.
 */
export function DevWalkMonitor() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;
    if (new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://clone.invalid").host !== "db.matrxserver.com") return;

    return installDevWalkMonitor({ window, EventSource, fetch });
  }, []);

  return null;
}
