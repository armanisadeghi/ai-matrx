"use client";

/**
 * Opener for the `siteCommandRunWindow` overlay — the floating "watch this
 * site command run" panel (analyze, sitemap sync, GSC sync, link check, page
 * fetch).
 *
 * Use this instead of a spinner on the button, and instead of inserting a
 * progress block into the page: a block shifts everything below it the moment
 * a run starts, and these runs take minutes. The window is identified by the
 * run itself (site + command + target), so re-running a command reuses its
 * window and a rejoined run reopens the same one.
 *
 * Callers normally reach this through `useSiteCommandRun`, which owns the
 * launch, the durable rejoin, and opening this window at both moments.
 */

import { useCallback } from "react";

import { useAppDispatch } from "@/lib/redux/hooks";
import { closeOverlay, openOverlay } from "@/lib/redux/slices/overlaySlice";
import {
  siteCommandKey,
  type SiteCommandMode,
} from "@/features/marketing/crawler/site-commands";

const OVERLAY_ID = "siteCommandRunWindow" as const;

export interface OpenSiteCommandRunWindowOptions {
  siteId: string;
  mode: SiteCommandMode;
  /** The page URL for `page_fetch`; omitted for site-wide commands. */
  target?: string | null;
  /** Brand-first site base path — makes the run's session id openable. */
  sitePath?: string | null;
}

export interface SiteCommandRunWindowHandle {
  instanceId: string;
  close: () => void;
}

export function useOpenSiteCommandRunWindow() {
  const dispatch = useAppDispatch();
  return useCallback(
    (opts: OpenSiteCommandRunWindowOptions): SiteCommandRunWindowHandle => {
      const target = opts.target ?? null;
      // One window per run identity: a second click on "Analyze now" must not
      // stack a second window over the one already showing that analysis.
      const instanceId = siteCommandKey(opts.siteId, opts.mode, target);
      dispatch(
        openOverlay({
          overlayId: OVERLAY_ID,
          instanceId,
          data: {
            windowInstanceId: instanceId,
            siteId: opts.siteId,
            mode: opts.mode,
            target,
            sitePath: opts.sitePath ?? null,
          },
        }),
      );
      return {
        instanceId,
        close: () =>
          dispatch(closeOverlay({ overlayId: OVERLAY_ID, instanceId })),
      };
    },
    [dispatch],
  );
}
