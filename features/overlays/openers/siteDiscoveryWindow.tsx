"use client";

/**
 * Opener for the `siteDiscoveryWindow` overlay — one site's Business Discovery
 * Ladder, its proposals and its setup doors in a floating panel (KI-040).
 *
 * A window and not a route change, so a person reviewing a site's queue or its
 * keywords keeps that view while they run discovery beside it (P25).
 */

import { useCallback } from "react";
import { useAppDispatch } from "@/lib/redux/hooks";
import { closeOverlay, openOverlay } from "@/lib/redux/slices/overlaySlice";

const OVERLAY_ID = "siteDiscoveryWindow" as const;

export interface OpenSiteDiscoveryWindowOptions {
  siteId: string;
  brandId?: string | null;
  organizationId?: string | null;
  /** The site's name or domain, for the title — no read needed to render. */
  siteLabel?: string | null;
}

export function useOpenSiteDiscoveryWindow() {
  const dispatch = useAppDispatch();
  return useCallback(
    (options: OpenSiteDiscoveryWindowOptions) => {
      dispatch(
        openOverlay({
          overlayId: OVERLAY_ID,
          data: {
            siteId: options.siteId,
            brandId: options.brandId ?? "",
            organizationId: options.organizationId ?? "",
            siteLabel: options.siteLabel ?? "",
          },
        }),
      );
      return { close: () => dispatch(closeOverlay({ overlayId: OVERLAY_ID })) };
    },
    [dispatch],
  );
}
