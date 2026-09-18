"use client";

/**
 * Opener for the `siteAnalyticsWindow` overlay — one site's Google Analytics in
 * a floating panel, so a reader comparing sites keeps their list on screen.
 * The window wraps the canonical `SiteAnalyticsPanel`.
 */

import { useCallback } from "react";
import { useAppDispatch } from "@/lib/redux/hooks";
import { closeOverlay, openOverlay } from "@/lib/redux/slices/overlaySlice";

const OVERLAY_ID = "siteAnalyticsWindow" as const;

export interface OpenSiteAnalyticsWindowOptions {
  siteId: string;
  /** The site's name or domain, for the title — no read needed to render. */
  siteLabel?: string | null;
}

export function useOpenSiteAnalyticsWindow() {
  const dispatch = useAppDispatch();
  return useCallback(
    (options: OpenSiteAnalyticsWindowOptions) => {
      dispatch(
        openOverlay({
          overlayId: OVERLAY_ID,
          data: {
            siteId: options.siteId,
            siteLabel: options.siteLabel ?? "",
          },
        }),
      );
      return { close: () => dispatch(closeOverlay({ overlayId: OVERLAY_ID })) };
    },
    [dispatch],
  );
}
