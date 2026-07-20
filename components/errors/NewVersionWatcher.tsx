"use client";

// NewVersionWatcher — the consent-based "a new version is available" prompt.
//
// Mounted once in app/layout.tsx. Two detection paths, one quiet corner toast
// (Supabase-style: message + "Not now" / "Refresh"), and — non-negotiable —
// it NEVER refreshes on its own. The user decides. See components/errors/FEATURE.md.
//
//   1. Proactive: this deployment's id is baked in server-side as a prop; we
//      poll /api/version (custom fetches are not pinned by Vercel Skew
//      Protection, so it always answers from the latest deployment) and prompt
//      when the ids diverge. Polling runs only while the tab is visible, plus
//      an immediate check when the tab regains visibility/focus.
//   2. Reactive: the "matrx:stale-chunk" window event (from the boot script's
//      global listeners or notifyStaleChunk) means a chunk already 404'd —
//      prompt immediately with firmer copy.
//
// It also raises the __MATRX_APP_BOOTED__ flag that forbids the pre-hydration
// boot script from ever reloading a live session.

import { useEffect, useRef } from "react";
import { toast } from "@/lib/toast";
import {
  APP_BOOTED_FLAG,
  STALE_CHUNK_EVENT,
} from "@/components/errors/chunk-load-recovery";

const POLL_INTERVAL_MS = 5 * 60_000;
/** Min gap between visibility/focus-triggered checks. */
const CHECK_THROTTLE_MS = 60_000;
/** After "Not now", stay quiet this long (chunk errors re-prompt sooner). */
const SNOOZE_MS = 30 * 60_000;
const TOAST_ID = "matrx-new-version";

interface NewVersionWatcherProps {
  /** This deployment's id, read server-side from VERCEL_DEPLOYMENT_ID.
   *  Null locally / self-hosted → polling disabled (chunk-error path stays). */
  deploymentId: string | null;
}

export function NewVersionWatcher({ deploymentId }: NewVersionWatcherProps) {
  const snoozedUntilRef = useRef(0);
  const lastCheckRef = useRef(0);
  const promptedRef = useRef(false);

  useEffect(() => {
    (window as unknown as Record<string, boolean>)[APP_BOOTED_FLAG] = true;

    const showPrompt = (kind: "deploy" | "chunk") => {
      // A chunk error means the page is actively degrading — it overrides a
      // "Not now" snooze from the gentler deploy prompt.
      if (kind === "deploy" && Date.now() < snoozedUntilRef.current) return;
      promptedRef.current = true;
      toast(
        kind === "chunk"
          ? "This page is out of date"
          : "A new version is available",
        {
          id: TOAST_ID,
          description:
            kind === "chunk"
              ? "A new version was deployed and part of this page could not load. Refresh when you're ready — unsaved work is kept until you do."
              : "Refresh to see the latest changes.",
          duration: Infinity,
          action: {
            label: "Refresh",
            onClick: () => window.location.reload(),
          },
          cancel: {
            label: "Not now",
            onClick: () => {
              snoozedUntilRef.current = Date.now() + SNOOZE_MS;
              // Resume polling so the prompt can return after the snooze.
              promptedRef.current = false;
            },
          },
        },
      );
    };

    const onStaleChunk = () => showPrompt("chunk");
    window.addEventListener(STALE_CHUNK_EVENT, onStaleChunk);

    if (!deploymentId) {
      return () => window.removeEventListener(STALE_CHUNK_EVENT, onStaleChunk);
    }

    let cancelled = false;
    const check = async () => {
      if (cancelled || promptedRef.current || document.hidden) return;
      lastCheckRef.current = Date.now();
      try {
        const res = await fetch("/api/version", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { deploymentId?: string | null };
        if (data.deploymentId && data.deploymentId !== deploymentId) {
          showPrompt("deploy");
        }
      } catch {
        // Offline / transient network failure — never surface, just retry on
        // the next tick. This watcher must be invisible until it has news.
      }
    };

    const interval = setInterval(check, POLL_INTERVAL_MS);
    const onVisible = () => {
      if (document.hidden) return;
      if (Date.now() - lastCheckRef.current < CHECK_THROTTLE_MS) return;
      void check();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);

    return () => {
      cancelled = true;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
      window.removeEventListener(STALE_CHUNK_EVENT, onStaleChunk);
    };
  }, [deploymentId]);

  return null;
}
