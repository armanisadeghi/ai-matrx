"use client";

// NewVersionWatcher — the consent-based "a new version is available" prompt.
//
// Mounted once in app/layout.tsx. Three prompt paths, one quiet corner toast
// (Supabase-style: message + "Not now" / "Refresh"), and — non-negotiable —
// it NEVER refreshes on its own. The user decides. See components/errors/FEATURE.md.
//
//   1. Proactive: this deployment's id is baked in server-side as a prop; we
//      poll /api/version (custom fetches are not pinned by Vercel Skew
//      Protection, so it always answers from the latest deployment) and prompt
//      when the ids diverge. Polling runs only while the tab is visible, plus
//      an immediate check when the tab regains visibility/focus.
//   2. Reactive: the "matrx:chunk-load-error" window event (from the boot script's
//      global listeners or notifyChunkLoadError) means a required module fetch
//      failed — prompt immediately with firmer, cause-neutral copy.
//   3. Directed: the "matrx:refresh-required" window event means the PLATFORM
//      asked this session to consider refreshing — a `refresh_required`
//      directive off the server bus (lib/client-directives/). It carries optional
//      operator copy. It is still an ASK: the same toast, the same buttons,
//      the same never-on-its-own law. See components/errors/refresh-directive.ts.
//
// It also raises the __MATRX_APP_BOOTED__ flag that forbids the pre-hydration
// boot script from ever reloading a live session.

import { useEffect, useRef } from "react";
import { toast } from "@/lib/toast";
import {
  APP_BOOTED_FLAG,
  CHUNK_LOAD_ERROR_EVENT,
} from "@/components/errors/chunk-load-recovery";
import {
  REFRESH_REQUIRED_EVENT,
  type RefreshRequiredDetail,
} from "@/components/errors/refresh-directive";

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

    const showPrompt = (
      kind: "deploy" | "chunk" | "directive",
      copy?: { title?: string | null; body?: string | null },
    ) => {
      // A chunk error means the page is actively degrading — it overrides a
      // "Not now" snooze from the gentler deploy prompt. A platform directive
      // is deliberate and rare, so it overrides the snooze too.
      if (kind === "deploy" && Date.now() < snoozedUntilRef.current) return;
      promptedRef.current = true;
      const title =
        kind === "chunk"
          ? "Part of this page failed to load"
          : (copy?.title ?? "A new version is available");
      const description =
        kind === "chunk"
          ? "Refresh to retry. Unsaved work is kept until you do."
          : (copy?.body ?? "Refresh to see the latest changes.");
      toast(
        title,
        {
          id: TOAST_ID,
          description,
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

    const onChunkLoadError = () => showPrompt("chunk");
    window.addEventListener(CHUNK_LOAD_ERROR_EVENT, onChunkLoadError);

    // The platform directive door. Unlike the two detection paths above it is
    // not a guess — something on the platform decided this session should be
    // asked — so it works with or without a deployment id (i.e. locally too).
    const onRefreshRequired = (event: Event) => {
      const detail = (event as CustomEvent<RefreshRequiredDetail>).detail;
      showPrompt("directive", { title: detail?.title, body: detail?.body });
    };
    window.addEventListener(REFRESH_REQUIRED_EVENT, onRefreshRequired);

    if (!deploymentId) {
      return () => {
        window.removeEventListener(CHUNK_LOAD_ERROR_EVENT, onChunkLoadError);
        window.removeEventListener(REFRESH_REQUIRED_EVENT, onRefreshRequired);
      };
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
      window.removeEventListener(CHUNK_LOAD_ERROR_EVENT, onChunkLoadError);
      window.removeEventListener(REFRESH_REQUIRED_EVENT, onRefreshRequired);
    };
  }, [deploymentId]);

  return null;
}
