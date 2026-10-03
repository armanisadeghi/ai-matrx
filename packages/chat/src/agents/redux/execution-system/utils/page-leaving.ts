/**
 * Is this page leaving? (reload, navigation, tab close)
 *
 * The browser cancels every request still in flight as a page goes, and fetch
 * reports each as a plain network failure — for a live answer stream that is
 * `stream_transport_lost`. That is the person leaving, not a failure: the
 * server keeps running the turn (detach_on_disconnect) and the next page
 * rejoins it. `beforeunload` is the earliest signal (it precedes the aborts);
 * `pagehide` covers paths that skip it; `pageshow` clears a leave that was
 * cancelled or a page restored from the back/forward cache. A stale mark also
 * expires after LEAVE_WINDOW_MS so a cancelled beforeunload prompt can never
 * silence real failures for the rest of the session.
 *
 * THE one detector: the stream capture gate here, the host app's stream
 * transport sink (lib/diagnostics/captureStreamError.ts) and its /api capture
 * (lib/diagnostics/captureAppApiFetch.ts) all read it, so a reload-cancelled
 * request is never an incident anywhere.
 */
const LEAVE_WINDOW_MS = 3000;
let leavingSince: number | null = null;
let bound = false;

function bind(): void {
  if (bound || typeof window === "undefined") return;
  bound = true;
  const mark = () => {
    leavingSince = Date.now();
  };
  window.addEventListener("beforeunload", mark);
  window.addEventListener("pagehide", mark);
  window.addEventListener("pageshow", () => {
    leavingSince = null;
  });
}

bind();

export function pageIsLeaving(): boolean {
  bind();
  return leavingSince !== null && Date.now() - leavingSince < LEAVE_WINDOW_MS;
}

/** Test seam ONLY. */
export function resetPageLeavingForTests(): void {
  leavingSince = null;
}
