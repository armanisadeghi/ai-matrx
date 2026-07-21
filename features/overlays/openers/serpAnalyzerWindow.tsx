"use client";

import { useCallback } from "react";
import { useAppDispatch } from "@/lib/redux/hooks";
import { closeOverlay, openOverlay } from "@/lib/redux/slices/overlaySlice";

const OVERLAY_ID = "serpAnalyzerWindow" as const;

/**
 * Open the canonical Search Appearance analyzer window with a page's
 * metadata pre-filled. Every field is optional — omit everything to open a
 * blank analyzer.
 */
export interface OpenSerpAnalyzerWindowOptions {
  url?: string;
  title?: string;
  description?: string;
}

export function useOpenSerpAnalyzerWindow() {
  const dispatch = useAppDispatch();
  return useCallback(
    (options: OpenSerpAnalyzerWindowOptions = {}) => {
      dispatch(
        openOverlay({
          overlayId: OVERLAY_ID,
          data: {
            url: options.url ?? "",
            title: options.title ?? "",
            description: options.description ?? "",
          },
        }),
      );
      return { close: () => dispatch(closeOverlay({ overlayId: OVERLAY_ID })) };
    },
    [dispatch],
  );
}
