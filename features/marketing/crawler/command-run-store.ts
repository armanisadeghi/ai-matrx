"use client";

/**
 * The live buffer for site-command runs.
 *
 * WHY THIS IS NOT COMPONENT STATE. Two consumers need the same run: the
 * surface that launched it (to disable its button and report the result) and
 * the floating `SiteCommandRunWindow`, which `OverlayController` renders at the
 * ROOT of the tree — outside the marketing site provider entirely. A run also
 * has to survive the launching component unmounting when the user navigates to
 * another tab of the same site while it works.
 *
 * WHY NOT REDUX. A page-fetch stream emits crawl events at page speed; a
 * dispatch per event is the freeze class this repo has paid for repeatedly.
 * This is a bounded, ephemeral stream buffer keyed by run, read through
 * `useSyncExternalStore` — not application state, and nothing here is
 * persisted. The DURABLE record is the `web.crawl_session` row the server
 * writes; that is what a reload rejoins (see `useSiteCommandRun`).
 */

import {
  mergeCrawlLiveEvents,
  siteCommandProgressFromEvent,
  type CrawlLiveEvent,
  type CrawlStreamCallbacks,
  type CrawlStreamResult,
} from "@/features/marketing/crawler/direct-client";
import {
  SITE_COMMAND_COPY,
  siteCommandKey,
  type SiteCommandMode,
} from "@/features/marketing/crawler/site-commands";

export type SiteCommandStatus =
  | "connecting"
  | "running"
  | "complete"
  | "failed";

export interface SiteCommandRunState {
  key: string;
  siteId: string;
  mode: SiteCommandMode;
  /** The page URL for `page_fetch`; null for site-wide commands. */
  target: string | null;
  status: SiteCommandStatus;
  sessionId: string | null;
  events: CrawlLiveEvent[];
  /** Newest narrated line from the server, or our starting sentence. */
  message: string;
  /** Newest counter object the command reported. */
  summary: Record<string, unknown> | null;
  /** Non-fatal per-item errors the command collected and continued through. */
  warnings: string[];
  error: string | null;
  startedAt: number;
  finishedAt: number | null;
  /** True when this run was rejoined from a durable session, not started here. */
  reattached: boolean;
}

type Listener = () => void;

const runs = new Map<string, SiteCommandRunState>();
const listeners = new Map<string, Set<Listener>>();
const globalListeners = new Set<Listener>();

function emit(key: string): void {
  for (const listener of listeners.get(key) ?? []) listener();
  for (const listener of globalListeners) listener();
}

function patch(key: string, next: Partial<SiteCommandRunState>): void {
  const current = runs.get(key);
  if (!current) return;
  runs.set(key, { ...current, ...next });
  emit(key);
}

export function getSiteCommandRun(key: string): SiteCommandRunState | null {
  return runs.get(key) ?? null;
}

export function subscribeSiteCommandRun(
  key: string,
  listener: Listener,
): () => void {
  const set = listeners.get(key) ?? new Set<Listener>();
  set.add(listener);
  listeners.set(key, set);
  return () => {
    set.delete(listener);
    if (set.size === 0) listeners.delete(key);
  };
}

/** Drop a finished run so a re-run starts from a clean feed. */
export function clearSiteCommandRun(key: string): void {
  if (!runs.delete(key)) return;
  emit(key);
}

function seed(input: {
  key: string;
  siteId: string;
  mode: SiteCommandMode;
  target: string | null;
  status: SiteCommandStatus;
  sessionId: string | null;
  startedAt: number;
  reattached: boolean;
}): void {
  runs.set(input.key, {
    key: input.key,
    siteId: input.siteId,
    mode: input.mode,
    target: input.target,
    status: input.status,
    sessionId: input.sessionId,
    events: [],
    message: input.reattached
      ? "Rejoined a run that was already in progress on the server."
      : SITE_COMMAND_COPY[input.mode].startingMessage,
    summary: null,
    warnings: [],
    error: null,
    startedAt: input.startedAt,
    finishedAt: null,
    reattached: input.reattached,
  });
  emit(input.key);
}

/**
 * Register a run this tab did NOT start — a durable session found still
 * running on load. Its progress events are gone (they were streamed to the
 * tab that launched it), so the surface shows the honest state: what is
 * running, since when, plus whatever the session's own durable rows carry.
 */
export function reattachSiteCommandRun(input: {
  siteId: string;
  mode: SiteCommandMode;
  target: string | null;
  sessionId: string;
  startedAt: number;
}): string {
  const key = siteCommandKey(input.siteId, input.mode, input.target);
  const existing = runs.get(key);
  // A run we are streaming ourselves is always the better record.
  if (existing && existing.sessionId === input.sessionId) return key;
  if (existing && !existing.finishedAt && !existing.reattached) return key;
  seed({
    key,
    siteId: input.siteId,
    mode: input.mode,
    target: input.target,
    status: "running",
    sessionId: input.sessionId,
    startedAt: input.startedAt,
    reattached: true,
  });
  return key;
}

/**
 * Mark a reattached run terminal once its durable session row says so. The
 * stream that would have told us belongs to another tab, so the session row
 * IS the completion signal — never a silent disappearance.
 */
export function settleReattachedSiteCommandRun(input: {
  key: string;
  status: "complete" | "failed";
  message: string;
  error: string | null;
  summary: Record<string, unknown> | null;
}): void {
  const current = runs.get(input.key);
  if (!current || !current.reattached || current.finishedAt) return;
  patch(input.key, {
    status: input.status,
    message: input.message,
    error: input.error,
    summary: input.summary ?? current.summary,
    finishedAt: Date.now(),
  });
}

/** Durable events fetched for a reattached session (page fetches have them). */
export function mergeDurableSiteCommandEvents(
  key: string,
  events: CrawlLiveEvent[],
): void {
  const current = runs.get(key);
  if (!current || events.length === 0) return;
  const merged = mergeCrawlLiveEvents(events, current.events);
  if (merged.length === current.events.length && current.events.length > 0) {
    return;
  }
  patch(key, { events: merged });
}

export interface StartSiteCommandInput {
  siteId: string;
  mode: SiteCommandMode;
  target?: string | null;
  /** The `direct-client` wrapper for this command, already bound to its args. */
  run: (callbacks: CrawlStreamCallbacks) => Promise<CrawlStreamResult>;
}

/**
 * Launch a command and stream it into the store. Rejects exactly as the
 * underlying command does — the caller still owns error reporting; this only
 * makes the run watchable while it happens.
 */
export async function startSiteCommandRun(
  input: StartSiteCommandInput,
): Promise<CrawlStreamResult> {
  const target = input.target ?? null;
  const key = siteCommandKey(input.siteId, input.mode, target);
  seed({
    key,
    siteId: input.siteId,
    mode: input.mode,
    target,
    status: "connecting",
    sessionId: null,
    startedAt: Date.now(),
    reattached: false,
  });

  try {
    const result = await input.run({
      onConnected: ({ sessionId }) =>
        patch(key, { sessionId, status: "running" }),
      onEvent: (_streamEvent, crawlEvent) => {
        if (!crawlEvent) return;
        const current = runs.get(key);
        if (!current) return;
        const progress = siteCommandProgressFromEvent(crawlEvent);
        patch(key, {
          status: "running",
          events: mergeCrawlLiveEvents(current.events, [crawlEvent]),
          message: progress?.message || current.message,
          summary: progress?.summary ?? current.summary,
          warnings: progress?.errors.length
            ? progress.errors
            : current.warnings,
        });
      },
    });
    const settled = runs.get(key);
    patch(key, {
      status: "complete",
      sessionId: result.sessionId,
      finishedAt: Date.now(),
      message:
        settled?.message && settled.message !== SITE_COMMAND_COPY[input.mode].startingMessage
          ? settled.message
          : "Finished.",
    });
    return result;
  } catch (error) {
    patch(key, {
      status: "failed",
      finishedAt: Date.now(),
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}
