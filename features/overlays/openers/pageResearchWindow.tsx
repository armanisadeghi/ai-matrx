"use client";

import { useCallback } from "react";
import { useAppDispatch } from "@/lib/redux/hooks";
import { closeOverlay, openOverlay } from "@/lib/redux/slices/overlaySlice";

const OVERLAY_ID = "pageResearchWindow" as const;

/**
 * Open the compact per-page research launcher for ONE planned page.
 *
 * Pass the page's own values — they are the point of this window: the topic
 * is named after the page and keyword #1 IS the page's target query (Arman,
 * `common-docs/projects/content-engine/STATE.md` §2.14: *"you're now passing
 * values that mean something from one step to the next"*).
 *
 * Opening is free; the user still presses Start, because a research run is a
 * paid agent + provider pipeline.
 */
export interface OpenPageResearchWindowOptions {
  /** The plan node the research will be attached to. Required. */
  nodeId: string;
  /** The node's site — recorded in the topic description. */
  siteId?: string | null;
  /** The page label — seeds the topic name. */
  pageLabel?: string | null;
  /** The page's target query — seeds keyword #1. */
  primaryKeyword?: string | null;
  /** The node's org — tenancy for the topic and its edge. */
  orgId?: string | null;
}

export function useOpenPageResearchWindow() {
  const dispatch = useAppDispatch();
  return useCallback(
    (options: OpenPageResearchWindowOptions) => {
      dispatch(
        openOverlay({
          overlayId: OVERLAY_ID,
          data: {
            nodeId: options.nodeId,
            siteId: options.siteId ?? "",
            pageLabel: options.pageLabel ?? "",
            primaryKeyword: options.primaryKeyword ?? "",
            orgId: options.orgId ?? "",
          },
        }),
      );
      return { close: () => dispatch(closeOverlay({ overlayId: OVERLAY_ID })) };
    },
    [dispatch],
  );
}
