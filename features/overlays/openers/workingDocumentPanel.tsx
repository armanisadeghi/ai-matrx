"use client";

/**
 * Opener for the `workingDocumentPanel` overlay — the agent-edited working
 * document opened in a NON-BLOCKING, resizable RIGHT SIDEBAR (SidePanelSurface),
 * as opposed to `workingDocumentWindow` (a draggable floating window).
 *
 * This is what a chat tool's `<ArtifactResultBar>` opens: after the agent
 * patches the working document, the result bar advertises it and a click parks
 * the final version in the sidebar so you can read/edit while the chat stays put.
 *
 * - `useOpenWorkingDocumentPanel()` — imperative hook; returns a `close()` handle.
 * - `<WorkingDocumentPanelController />` — declarative wrapper.
 *
 * Singleton: there is one right sidebar. Opening for another conversation
 * replaces the content (the panel re-points at the new conversation's doc).
 */

import { useCallback, useEffect } from "react";
import { useAppDispatch } from "@/lib/redux/hooks";
import { closeOverlay, openOverlay } from "@/lib/redux/slices/overlaySlice";

const OVERLAY_ID = "workingDocumentPanel" as const;

export interface OpenWorkingDocumentPanelOptions {
  conversationId: string;
  /** Header title; falls back to "Working document". */
  title?: string;
  /** Which document tab to open first ("working" | "scratch"). */
  initialKind?: "working" | "scratch";
}

export interface WorkingDocumentPanelHandle {
  close: () => void;
}

export function useOpenWorkingDocumentPanel() {
  const dispatch = useAppDispatch();
  return useCallback(
    (opts: OpenWorkingDocumentPanelOptions): WorkingDocumentPanelHandle => {
      dispatch(
        openOverlay({
          overlayId: OVERLAY_ID,
          data: {
            conversationId: opts.conversationId,
            title: opts.title,
            initialKind: opts.initialKind,
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

/**
 * Declarative form. Renders nothing visible; opens the overlay on mount,
 * closes it on unmount.
 */
export function WorkingDocumentPanelController(
  props: OpenWorkingDocumentPanelOptions,
): null {
  const open = useOpenWorkingDocumentPanel();
  useEffect(() => {
    const handle = open(props);
    return () => handle.close();
  }, [open, props.conversationId, props.title]);
  return null;
}
