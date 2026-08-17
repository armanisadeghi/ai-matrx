"use client";

/**
 * Opener for the `addToRulebookDialog` overlay — the Oracle tap (Masterwork
 * Approach #10, in-app): save a chat answer into one of your Rulebooks as a
 * draft rule. Both entry points (message ⋯ menu, thumbs follow-up nudge) open
 * this ONE dialog.
 *
 * - `useOpenAddToRulebookDialog()` — imperative hook, returns a handle.
 * - `<AddToRulebookDialogController />` — declarative wrapper.
 */

import { useCallback, useEffect } from "react";
import { useAppDispatch } from "@/lib/redux/hooks";
import { closeOverlay, openOverlay } from "@/lib/redux/slices/overlaySlice";

const OVERLAY_ID = "addToRulebookDialog" as const;

export interface OpenAddToRulebookDialogOptions {
  /** The message content that becomes the draft rule's statement. */
  initialContent: string;
  /** The conversation the message came from — recorded in `source_ref`. */
  initialConversationId?: string | null;
}

export interface AddToRulebookDialogHandle {
  close: () => void;
}

export function useOpenAddToRulebookDialog() {
  const dispatch = useAppDispatch();
  return useCallback(
    (opts: OpenAddToRulebookDialogOptions): AddToRulebookDialogHandle => {
      dispatch(
        openOverlay({
          overlayId: OVERLAY_ID,
          data: {
            initialContent: opts.initialContent,
            initialConversationId: opts.initialConversationId ?? null,
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

export function AddToRulebookDialogController(
  props: OpenAddToRulebookDialogOptions,
): null {
  const open = useOpenAddToRulebookDialog();
  useEffect(() => {
    const handle = open(props);
    return () => handle.close();
  }, [open, props.initialContent, props.initialConversationId]);
  return null;
}
