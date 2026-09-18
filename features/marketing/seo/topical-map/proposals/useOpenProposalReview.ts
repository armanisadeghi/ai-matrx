"use client";

/**
 * features/marketing/seo/topical-map/proposals/useOpenProposalReview.ts — the
 * "Review N proposals" door the home, the outline and any other screen can
 * open from anywhere.
 *
 * RULING (Lane G, 2026-09-18): proposals have no route of their own — the
 * workspace has six screens and proposal review lives on the HISTORY screen,
 * above the rejected/retired list (vision §2.5 puts "pending, accepted,
 * rejected" in one history control). So the route-less door is the MAP
 * WINDOW opened on `screen: "history"`: it works on the Content home, in
 * chat, on a content-plan page — anywhere — and it is one window rather than
 * a second overlay that would drift from the screen. A page host that is
 * already inside the map navigates instead (`onScreenChange`), which the
 * caller decides by passing `prefer: "page"` with its own navigator.
 *
 * Cost if wrong: one opener to repoint at a dedicated review overlay.
 */

import { useCallback } from "react";

import { useOpenTopicalMapWindow } from "@/features/overlays/openers/topicalMapWindow";

export interface OpenProposalReviewOptions {
  mapId: string;
  siteId?: string | null;
  /**
   * When the caller stands inside the map's page host it can navigate to the
   * history screen itself; pass its navigator and no window opens.
   */
  navigate?: ((screen: "history") => void) | null;
}

export function useOpenProposalReview() {
  const openWindow = useOpenTopicalMapWindow();
  return useCallback(
    (opts: OpenProposalReviewOptions): void => {
      if (opts.navigate) {
        opts.navigate("history");
        return;
      }
      openWindow({ mapId: opts.mapId, screen: "history", siteId: opts.siteId ?? null });
    },
    [openWindow],
  );
}
