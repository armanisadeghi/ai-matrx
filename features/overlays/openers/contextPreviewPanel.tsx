"use client";

/**
 * Opener for the `contextPreviewPanel` overlay — "what the agent receives".
 *
 * A NON-BLOCKING, resizable right sidebar (SidePanelSurface) showing the
 * SERVER-RESOLVED context for the user's current settings: the exact
 * system-prompt context block plus the resolved variables/cells, fetched from
 * the same code path the agent run uses (`POST /ai/context/preview`). Also
 * lists the client-side attachments published for this conversation's turns.
 *
 * Opened from the "Context" segment of the composer's ContextLensBar.
 * Singleton: reopening for another conversation re-points the panel.
 */

import { useCallback } from "react";
import { useAppDispatch } from "@/lib/redux/hooks";
import { closeOverlay, openOverlay } from "@/lib/redux/slices/overlaySlice";

const OVERLAY_ID = "contextPreviewPanel" as const;

export interface OpenContextPreviewPanelOptions {
  /** Conversation whose context to preview; omit for a brand-new chat. */
  conversationId?: string;
  /** Agent whose variable/slot bindings should be resolved too. */
  agentId?: string;
}

export interface ContextPreviewPanelHandle {
  close: () => void;
}

export function useOpenContextPreviewPanel() {
  const dispatch = useAppDispatch();
  return useCallback(
    (
      opts: OpenContextPreviewPanelOptions = {},
    ): ContextPreviewPanelHandle => {
      dispatch(
        openOverlay({
          overlayId: OVERLAY_ID,
          data: {
            conversationId: opts.conversationId,
            agentId: opts.agentId,
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
