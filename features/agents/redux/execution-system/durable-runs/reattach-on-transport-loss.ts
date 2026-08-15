/**
 * reattachOnTransportLoss — the ONE bounded reattach loop for a durable,
 * server-orchestrated run whose client transport dropped mid-stream.
 *
 * ## Why this exists
 *
 * `adoptForeignStream` renders a run the SERVER orchestrates (a pipeline
 * endpoint that claims a durable job row before spending a cent, streams
 * progress, and persists the result). Those runs are `detach_on_disconnect`:
 * killing the client socket detaches DELIVERY, never the work.
 *
 * Until now a dropped socket on such a run surfaced as a hard failure with
 * "reload to rejoin it" — a dead end that asked the user to do by hand the one
 * thing the platform already knows how to do (FOUND_DEFECTS D183). Every
 * durable-run surface has a rejoin path (`POST /seo/collections/{run_id}/rejoin`
 * for SEO command runs); what none of them had is the piece that DECIDES to
 * use it. That decision is identical everywhere, so it lives here once:
 *
 *   transport dropped  →  wait  →  reopen the stream for the SAME durable run
 *                                   id  →  repeat, bounded  →  give up loudly.
 *
 * The surface supplies only the one thing that genuinely differs: how to
 * reopen a stream for its run (`rejoin`).
 *
 * ## What this is NOT
 *
 * It does not parse, render, or buffer anything — `rejoin` re-enters the
 * surface's normal `adoptForeignStream` + `callApi` path, so the canonical
 * pipeline is still the only renderer. It also never fires on a real backend
 * failure: a run that dies server-side closes its body cleanly with a typed
 * `error` event, which is not a transport loss (see `StreamTransportError`).
 *
 * ## Usage
 *
 * ```ts
 * const reattach = createTransportLossReattacher({
 *   label: "keyword research",
 *   rejoin: (attempt) => rejoinResearch(runId, phrase),
 * });
 * // …in adoptForeignStream({ onTransportLost: reattach.onTransportLost })
 * // …and reattach.cancel() on unmount / on a new logical run.
 * ```
 */

import { toast } from "@/lib/toast";

export interface TransportLossReattacherConfig {
  /**
   * Reopen the stream for the SAME durable run. Called with the 1-based
   * attempt number. Resolve when the reattached stream has settled; throw (or
   * reject) to let the loop try again.
   */
  rejoin: (attempt: number) => Promise<void>;
  /** Human label for the toast + diagnostics, e.g. "keyword research". */
  label: string;
  /** Total reattach attempts before giving up. Default 4. */
  maxAttempts?: number;
  /** First backoff delay; each attempt multiplies by 2 (capped 30s). Default 2s. */
  baseDelayMs?: number;
}

export interface TransportLossReattacher {
  /** Hand this to `adoptForeignStream({ onTransportLost })`. */
  onTransportLost: () => void;
  /** Stand down — unmount, a new logical run, or a user-initiated cancel. */
  cancel: () => void;
}

const MAX_DELAY_MS = 30_000;

const sleep = (ms: number, signal: AbortSignal): Promise<void> =>
  new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException("aborted", "AbortError"));
      return;
    }
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    function onAbort(): void {
      clearTimeout(timer);
      reject(new DOMException("aborted", "AbortError"));
    }
    signal.addEventListener("abort", onAbort, { once: true });
  });

export function createTransportLossReattacher(
  config: TransportLossReattacherConfig,
): TransportLossReattacher {
  const { rejoin, label, maxAttempts = 4, baseDelayMs = 2_000 } = config;
  let controller: AbortController | null = null;
  let running = false;

  const cancel = (): void => {
    controller?.abort();
    controller = null;
    running = false;
  };

  const onTransportLost = (): void => {
    // One loop at a time. A reattached stream that drops again re-enters
    // through its OWN onTransportLost, which resumes the same accounting.
    if (running) return;
    running = true;
    const local = new AbortController();
    controller = local;

    void (async () => {
      // Loud recovery: reaching here means a real defect (a dropped socket on
      // a paid run) got past the proactive layer. Never silent.
      console.warn(
        `[reattach-on-transport-loss] ${label}: transport dropped mid-run — the server run is detached and still going. Reattaching.`,
      );
      toast.info("Connection dropped", {
        description: `Your ${label} is still running on the server. Reconnecting to it now.`,
      });

      let delayMs = baseDelayMs;
      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        try {
          await sleep(delayMs, local.signal);
        } catch {
          return; // cancelled
        }
        delayMs = Math.min(delayMs * 2, MAX_DELAY_MS);
        if (local.signal.aborted) return;
        try {
          await rejoin(attempt);
          if (local.signal.aborted) return;
          console.warn(
            `[reattach-on-transport-loss] ${label}: reattached on attempt ${attempt}.`,
          );
          running = false;
          controller = null;
          return;
        } catch (error) {
          if (local.signal.aborted) return;
          console.warn(
            `[reattach-on-transport-loss] ${label}: reattach attempt ${attempt}/${maxAttempts} failed.`,
            error,
          );
        }
      }

      running = false;
      controller = null;
      // Bounded, and honest when the bound is hit — the WORK is still safe on
      // the server (that is the whole point of the durable run row), only our
      // delivery gave up.
      console.error(
        `[reattach-on-transport-loss] ${label}: gave up after ${maxAttempts} reattach attempts.`,
      );
      toast.error("Could not reconnect", {
        description: `Your ${label} is still running on the server and its result is saved. Reload this page to pick it back up.`,
      });
    })();
  };

  return { onTransportLost, cancel };
}
