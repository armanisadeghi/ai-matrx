"use client";

/**
 * useSiteCommandRun — the ONE way a marketing surface runs a site command.
 *
 * It closes both halves of the defect this replaces (`docs/handoffs/
 * live-run-streaming-sweep.md` §1): every command already streamed NDJSON
 * progress the callers discarded while showing a spinner, and every command
 * already wrote a durable `web.crawl_session` row that nothing rejoined after
 * a reload.
 *
 *  - LIVE: the run streams into the floating `SiteCommandRunWindow` — the
 *    server's own narrated lines and counters, never a spinner, never a block
 *    inserted above the content the user is working in (THE FLOATING LAW,
 *    `features/window-panels/FEATURE.md`).
 *  - DURABLE: on mount it looks for a session of this command still running on
 *    the server — started by this tab before a reload, by another tab, or by
 *    another device — rejoins it, reopens the window, and reports the outcome
 *    from the session row when it lands.
 *
 * Errors are never swallowed: the run's failure rejects out of `launch()` for
 * the caller's toast, and `streamCommand` has already captured it to the Error
 * Inspector.
 */

import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import { useQueryClient } from "@tanstack/react-query";

import type {
  CrawlStreamCallbacks,
  CrawlStreamResult,
} from "@/features/marketing/crawler/direct-client";
import { crawlLiveEventFromDurableRow } from "@/features/marketing/crawler/direct-client";
import {
  clearSiteCommandRun,
  getSiteCommandRun,
  mergeDurableSiteCommandEvents,
  reattachSiteCommandRun,
  settleReattachedSiteCommandRun,
  startSiteCommandRun,
  subscribeSiteCommandRun,
  type SiteCommandRunState,
} from "@/features/marketing/crawler/command-run-store";
import {
  siteCommandKey,
  siteCommandModeFromSession,
  siteCommandTargetFromSession,
  type SiteCommandMode,
} from "@/features/marketing/crawler/site-commands";
import { useMarketingSite } from "@/features/marketing/components/site/MarketingSiteLayoutClient";
import { marketingKeys, useRecentLiveCrawlEvents } from "@/features/marketing/data/hooks";
import { getCrawl } from "@/features/marketing/data/service";
import { useOpenSiteCommandRunWindow } from "@/features/overlays/openers/siteCommandRunWindow";
import { captureError } from "@/lib/diagnostics/errorCaptureStore";

export interface UseSiteCommandRunOptions {
  siteId: string;
  mode: SiteCommandMode;
  /** The page URL for `page_fetch`; omit for site-wide commands. */
  target?: string | null;
  /** The bound `direct-client` command, e.g. `(cb) => analyzeSite(siteId, cb)`. */
  run: (callbacks: CrawlStreamCallbacks) => Promise<CrawlStreamResult>;
  /**
   * Fired once the command finished successfully — including when it finished
   * on the server while this tab was reloading. Refetches belong here.
   */
  onComplete?: (result: CrawlStreamResult | null) => void | Promise<void>;
  /** Fired when a REJOINED run turns out to have failed server-side. */
  onRemoteFailure?: (message: string) => void;
}

export interface SiteCommandRunHandle {
  /** The live run, or null when nothing is running or has run here. */
  state: SiteCommandRunState | null;
  /** True while the command is working — including a rejoined server run. */
  isActive: boolean;
  /** Launch it. Rejects with the command's own error; the caller reports it. */
  launch: () => Promise<CrawlStreamResult>;
  /** Bring the run's window back after the user closed it. */
  openWindow: () => void;
}

export function useSiteCommandRun(
  options: UseSiteCommandRunOptions,
): SiteCommandRunHandle {
  const { siteId, mode, run } = options;
  const target = options.target ?? null;
  const key = siteCommandKey(siteId, mode, target);
  const { crawlActivity, sitePath } = useMarketingSite();
  const queryClient = useQueryClient();
  const openWindow = useOpenSiteCommandRunWindow();

  const state = useSyncExternalStore(
    (listener) => subscribeSiteCommandRun(key, listener),
    () => getSiteCommandRun(key),
    () => null,
  );

  // Latest-value refs, written in an effect (never during render) so the
  // launch closure and the completion effects always see the current
  // callbacks without re-running on every parent re-render.
  const runRef = useRef(run);
  const onCompleteRef = useRef(options.onComplete);
  const onRemoteFailureRef = useRef(options.onRemoteFailure);
  const openWindowRef = useRef(openWindow);
  useEffect(() => {
    runRef.current = run;
    onCompleteRef.current = options.onComplete;
    onRemoteFailureRef.current = options.onRemoteFailure;
    openWindowRef.current = openWindow;
  });

  /**
   * The server-side session for THIS command, if one is live right now. For a
   * page fetch the target URL must match too — otherwise a reload on one page
   * would attach to the fetch of a different one.
   */
  const remoteSession =
    crawlActivity.activeSessions.find((session) => {
      if (siteCommandModeFromSession(session) !== mode) return false;
      if (!target) return true;
      return siteCommandTargetFromSession(session) === target;
    }) ?? null;

  // Rejoin a run this tab is not streaming, and show it — the whole point is
  // that a reload lands on the run instead of on a blank panel.
  const remoteSessionId = remoteSession?.id ?? null;
  // The raw timestamp, parsed inside the effect — a `Date.now()` fallback
  // computed during render is impure and re-reads on every render.
  const remoteStartedIso =
    remoteSession?.started_at ?? remoteSession?.created_at ?? null;
  // Opened ONCE per session. The active-session query re-runs on every
  // realtime heartbeat (and every 3s while polling); reopening the window on
  // each pass would make it impossible for the user to close it.
  const openedForSession = useRef<string | null>(null);
  useEffect(() => {
    if (!remoteSessionId) return;
    if (openedForSession.current === remoteSessionId) return;
    const current = getSiteCommandRun(key);
    // Never rejoin a run this tab is streaming — or just finished streaming.
    // The active-session query lags the stream by one refetch, so without the
    // second half a completed run flickers back to "Rejoined · running".
    if (current && !current.reattached) {
      if (!current.finishedAt || current.sessionId === remoteSessionId) return;
    }
    openedForSession.current = remoteSessionId;
    reattachSiteCommandRun({
      siteId,
      mode,
      target,
      sessionId: remoteSessionId,
      startedAt: (remoteStartedIso ? Date.parse(remoteStartedIso) : 0) || Date.now(),
    });
    openWindowRef.current({ siteId, mode, target, sitePath });
  }, [remoteSessionId, remoteStartedIso, key, siteId, mode, target, sitePath]);

  // A rejoined run has durable events only when the command writes them (a
  // page fetch runs the crawl pipeline and does). Empty for the rest, which
  // the feed states plainly rather than pretending to have a stream.
  const rejoinedSessionId =
    state?.reattached && !state.finishedAt ? state.sessionId : null;
  const durableEvents = useRecentLiveCrawlEvents(
    siteId,
    rejoinedSessionId,
    true,
  );
  const durableRows = durableEvents.data;
  useEffect(() => {
    if (!rejoinedSessionId || !durableRows?.length) return;
    mergeDurableSiteCommandEvents(
      key,
      durableRows.flatMap((row) => {
        const event = crawlLiveEventFromDurableRow(row);
        return event ? [event] : [];
      }),
    );
  }, [key, rejoinedSessionId, durableRows]);

  // The rejoined run's completion signal is its session row going terminal —
  // the stream that would have said so belongs to another tab.
  useEffect(() => {
    if (!rejoinedSessionId || remoteSessionId === rejoinedSessionId) return;
    let cancelled = false;
    void (async () => {
      try {
        const session = await getCrawl(siteId, rejoinedSessionId);
        if (cancelled) return;
        const failed = session.status === "failed";
        settleReattachedSiteCommandRun({
          key,
          status: failed ? "failed" : "complete",
          message: failed
            ? "The command failed on the server."
            : "Finished on the server.",
          error: failed ? (session.error ?? "The command failed.") : null,
          summary:
            session.stats && typeof session.stats === "object"
              ? (session.stats as Record<string, unknown>)
              : null,
        });
        if (failed) {
          onRemoteFailureRef.current?.(
            session.error ?? "The command failed on the server.",
          );
        } else {
          await onCompleteRef.current?.(null);
        }
      } catch (error) {
        if (cancelled) return;
        // Never silent: the run's outcome is unknown, and that IS the news.
        settleReattachedSiteCommandRun({
          key,
          status: "failed",
          message: "Could not read the outcome of this run.",
          error:
            error instanceof Error
              ? error.message
              : "Could not read the run's session row.",
          summary: null,
        });
        captureError({
          source: "marketing-crawler",
          relation: `site-command:${mode}`,
          message:
            error instanceof Error
              ? error.message
              : "Could not read a rejoined command session.",
          userMessage: "Could not read the outcome of a background run.",
          raw: { siteId, sessionId: rejoinedSessionId },
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [key, siteId, mode, rejoinedSessionId, remoteSessionId]);

  const isActive =
    state?.status === "connecting" ||
    state?.status === "running" ||
    Boolean(remoteSession);

  const launch = useCallback(async () => {
    // A finished run's feed belongs to the previous click.
    clearSiteCommandRun(key);
    openWindowRef.current({ siteId, mode, target, sitePath });
    try {
      const result = await startSiteCommandRun({
        siteId,
        mode,
        target,
        run: (callbacks) =>
          runRef.current({
            ...callbacks,
            onConnected: (connection) => {
              callbacks.onConnected?.(connection);
              // The session row now exists; every surface watching this site
              // should see it without waiting for the next poll.
              crawlActivity.refresh();
            },
          }),
      });
      crawlActivity.refresh();
      void queryClient.invalidateQueries({
        queryKey: marketingKeys.activeSessions(siteId),
      });
      await onCompleteRef.current?.(result);
      return result;
    } catch (error) {
      crawlActivity.refresh();
      throw error;
    }
  }, [key, siteId, mode, target, sitePath, crawlActivity, queryClient]);

  const reopen = useCallback(
    () => openWindowRef.current({ siteId, mode, target, sitePath }),
    [siteId, mode, target, sitePath],
  );

  return { state, isActive, launch, openWindow: reopen };
}
