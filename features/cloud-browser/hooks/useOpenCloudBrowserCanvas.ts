"use client";

/**
 * useOpenCloudBrowserCanvas — the ONE way both triggers open the Cloud Browser.
 *
 * Per the 2026-08 steering, the Cloud Browser is hosted as a CANVAS ITEM (not a
 * standalone route or a bespoke overlay container): it renders inside the
 * existing artifacts/canvas side-sheet, reusing the frame + header the canvas
 * pane already provides. Both entry points call this:
 *   - agent-initiated: the client-side handoff / cloud-browser tool outcome;
 *   - composer attachment: the "work in a cloud browser" pill on the smart
 *     input's ConversationContextRail.
 *
 * The standalone `WindowPanel` opener (`useOpenCloudBrowserWindow`) still works,
 * but the canvas is the primary host. `cloud_browser` is NON_PERSISTABLE — its
 * live run/screenshot/handoff state is never serialized to `canvas_items`.
 */

import { useCallback } from "react";
import { useCanvas } from "@/features/canvas/hooks/useCanvas";

export interface OpenCloudBrowserCanvasOptions {
  initialProfileId?: string | null;
  /** The run this handoff/outcome belongs to, when the opener knows it. */
  runId?: string | null;
  /**
   * The chat this browser belongs to. THE BINDING — it is what lets taking
   * control steer the running agent's turn instead of yanking the browser out
   * from under it (`useCloudBrowserTakeover`). Every opener that has one must
   * pass it; without it the surface can only take control immediately.
   */
  conversationId?: string | null;
}

/** Stable per-chat canvas identity, so opening twice shows/hides one item
 *  rather than stacking browsers. */
export function cloudBrowserCanvasSourceId(conversationId: string): string {
  return `cloud-browser:${conversationId}`;
}

export function useOpenCloudBrowserCanvas() {
  const { open } = useCanvas();
  return useCallback(
    (opts: OpenCloudBrowserCanvasOptions = {}) => {
      const conversationId = opts.conversationId ?? undefined;
      open({
        type: "cloud_browser",
        data: {
          initialProfileId: opts.initialProfileId ?? undefined,
          runId: opts.runId ?? undefined,
        },
        metadata: {
          title: "Cloud Browser",
          conversationId,
          sourceMessageId: conversationId
            ? cloudBrowserCanvasSourceId(conversationId)
            : undefined,
        },
      });
    },
    [open],
  );
}
