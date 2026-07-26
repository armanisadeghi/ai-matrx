"use client";

import { useCallback } from "react";
import { useAppDispatch } from "@/lib/redux/hooks";
import { closeOverlay, openOverlay } from "@/lib/redux/slices/overlaySlice";

const OVERLAY_ID = "keywordResearchWindow" as const;

/**
 * Open the canonical Keyword Research window from any surface — the shared
 * launcher + live key-by-key stream feed + compact cluster explorer.
 *
 * Pass `primaryKeyword` to pre-fill the input (a content-plan node's target
 * keyword, a GSC query, a chip the user right-clicked). Add `autoRun: true`
 * to fire the research immediately — use ONLY for an explicit user gesture
 * ("Research this keyword"), never on passive open: a run is a paid
 * agent + provider pipeline.
 */
export interface OpenKeywordResearchWindowOptions {
  primaryKeyword?: string;
  autoRun?: boolean;
}

export function useOpenKeywordResearchWindow() {
  const dispatch = useAppDispatch();
  return useCallback(
    (options: OpenKeywordResearchWindowOptions = {}) => {
      dispatch(
        openOverlay({
          overlayId: OVERLAY_ID,
          data: {
            primaryKeyword: options.primaryKeyword ?? "",
            autoRun: options.autoRun ?? false,
          },
        }),
      );
      return { close: () => dispatch(closeOverlay({ overlayId: OVERLAY_ID })) };
    },
    [dispatch],
  );
}
