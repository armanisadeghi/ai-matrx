"use client";

/**
 * Opener for the `sendToAgentDialog` overlay — "Send to another agent…": pick
 * any agent, choose where the content goes (one of its variables or context
 * slots, "Important context", or "Your message"), and the agent opens in a
 * floating window with it in place, unsent.
 *
 * - `useOpenSendToAgentDialog()` — imperative hook, returns a handle.
 * - `<SendToAgentDialogController />` — declarative wrapper.
 * - `sendToAgentDialogAction()` — the plain action, for non-React callers (the
 *   rich-document action handler, which has `dispatch` but no hooks).
 */

import { useCallback, useEffect } from "react";
import { useAppDispatch } from "@/lib/redux/hooks";
import { closeOverlay, openOverlay } from "@/lib/redux/slices/overlaySlice";

const OVERLAY_ID = "sendToAgentDialog" as const;

export interface OpenSendToAgentDialogOptions {
  /** The text being sent on to another agent. */
  initialContent: string;
  /** Where it came from (e.g. the conversation title) — shown in the dialog. */
  initialSourceTitle?: string | null;
  /** The source's organization — the new run files under the same one. */
  initialOrganizationId?: string | null;
}

export interface SendToAgentDialogHandle {
  close: () => void;
}

export function sendToAgentDialogAction(opts: OpenSendToAgentDialogOptions) {
  return openOverlay({
    overlayId: OVERLAY_ID,
    data: {
      initialContent: opts.initialContent,
      initialSourceTitle: opts.initialSourceTitle ?? null,
      initialOrganizationId: opts.initialOrganizationId ?? null,
    },
  });
}

export function useOpenSendToAgentDialog() {
  const dispatch = useAppDispatch();
  return useCallback(
    (opts: OpenSendToAgentDialogOptions): SendToAgentDialogHandle => {
      dispatch(sendToAgentDialogAction(opts));
      return {
        close: () => dispatch(closeOverlay({ overlayId: OVERLAY_ID })),
      };
    },
    [dispatch],
  );
}

export function SendToAgentDialogController(
  props: OpenSendToAgentDialogOptions,
): null {
  const open = useOpenSendToAgentDialog();
  useEffect(() => {
    const handle = open(props);
    return () => handle.close();
  }, [
    open,
    props.initialContent,
    props.initialSourceTitle,
    props.initialOrganizationId,
  ]);
  return null;
}
