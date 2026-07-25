"use client";

/**
 * Opener for the `researchContextPreviewWindow` overlay.
 *
 * Only the bundle DESCRIPTOR travels through Redux — the window resolves it
 * into the actual payload itself. A resolved research context routinely runs
 * to 300k+ characters; putting that in the store (and in every devtools
 * snapshot) to render a preview would be the wrong trade.
 *
 * Singleton: opening it again for a different selection retargets the same
 * window rather than stacking copies.
 */

import { useCallback } from "react";
import { useAppDispatch } from "@/lib/redux/hooks";
import { closeOverlay, openOverlay } from "@/lib/redux/slices/overlaySlice";
import type { ContextBundle } from "@/features/research/resources/types";

const OVERLAY_ID = "researchContextPreviewWindow" as const;

export interface OpenResearchContextPreviewOptions {
  topicId: string;
  /** The selection to resolve — rules, not resolved text. */
  bundle: ContextBundle;
  /** Shown in the action bar's save/export names. */
  title?: string;
}

export interface ResearchContextPreviewHandle {
  close: () => void;
}

export function useOpenResearchContextPreview() {
  const dispatch = useAppDispatch();
  return useCallback(
    (
      opts: OpenResearchContextPreviewOptions,
    ): ResearchContextPreviewHandle => {
      dispatch(
        openOverlay({
          overlayId: OVERLAY_ID,
          data: {
            topicId: opts.topicId,
            bundle: opts.bundle,
            title: opts.title,
          },
        }),
      );
      return {
        close: () => dispatch(closeOverlay({ overlayId: OVERLAY_ID })),
      };
    },
    [dispatch],
  );
}
