"use client";

/**
 * Opener for the `siteTrackingWindow` overlay — one site's Tag Manager tracking in a floating
 * panel, so a reader comparing sites keeps their list on screen. The window wraps the canonical
 * `SiteTrackingPanel`.
 */

import { useCallback } from "react";
import { useAppDispatch } from "@/lib/redux/hooks";
import { closeOverlay, openOverlay } from "@/lib/redux/slices/overlaySlice";

const OVERLAY_ID = "siteTrackingWindow" as const;

export interface OpenSiteTrackingWindowOptions {
  siteId: string;
  /** The site's name or domain, for the title — no read needed to render. */
  siteLabel?: string | null;
}

export function useOpenSiteTrackingWindow() {
  const dispatch = useAppDispatch();
  return useCallback(
    (options: OpenSiteTrackingWindowOptions) => {
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
