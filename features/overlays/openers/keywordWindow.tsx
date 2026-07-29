"use client";

import { useCallback } from "react";
import { useAppDispatch } from "@/lib/redux/hooks";
import { closeOverlay, openOverlay } from "@/lib/redux/slices/overlaySlice";

const OVERLAY_ID = "keywordWindow" as const;

/**
 * Open the canonical Keyword Intelligence window — everything the platform
 * knows about one keyword in one floating tabbed panel. Every field is
 * optional: pass a site/page/brand binding to light up the site-scoped tabs
 * (Site performance, Rankings, SERP); omit everything for a blank window.
 */
export interface OpenKeywordWindowOptions {
  phrase?: string;
  organizationId?: string;
  siteId?: string;
  pageId?: string;
  brandId?: string;
  /** Land on a specific tab (overview | relationships | site | rankings | serp | research). */
  tab?: string;
}

export function useOpenKeywordWindow() {
  const dispatch = useAppDispatch();
  return useCallback(
    (options: OpenKeywordWindowOptions = {}) => {
      dispatch(
        openOverlay({
          overlayId: OVERLAY_ID,
          data: {
            phrase: options.phrase ?? "",
            targetPhrase: options.phrase ?? "",
            history: [],
            organizationId: options.organizationId ?? "",
            siteId: options.siteId ?? "",
            pageId: options.pageId ?? "",
            brandId: options.brandId ?? "",
            activeTab: options.tab ?? "overview",
          },
        }),
      );
      return { close: () => dispatch(closeOverlay({ overlayId: OVERLAY_ID })) };
    },
    [dispatch],
  );
}
