"use client";

import { useCallback } from "react";
import { useAppDispatch } from "@/lib/redux/hooks";
import { closeOverlay, openOverlay } from "@/lib/redux/slices/overlaySlice";

const OVERLAY_ID = "keywordClassificationWindow" as const;

/**
 * Open the keyword-classification workbench as a floating window for one
 * site — the traffic-class truth editor, reachable from anywhere a class
 * question arises (Insights, Dig Here, drill-downs). Single instance:
 * opening for another site retargets the panel.
 */
export interface OpenKeywordClassificationWindowOptions {
  siteId: string;
  siteDomain: string;
  organizationId?: string | null;
}

export function useOpenKeywordClassificationWindow() {
  const dispatch = useAppDispatch();
  return useCallback(
    (options: OpenKeywordClassificationWindowOptions) => {
      dispatch(
        openOverlay({
          overlayId: OVERLAY_ID,
          data: {
            siteId: options.siteId,
            siteDomain: options.siteDomain,
            organizationId: options.organizationId ?? "",
          },
        }),
      );
      return { close: () => dispatch(closeOverlay({ overlayId: OVERLAY_ID })) };
    },
    [dispatch],
  );
}
