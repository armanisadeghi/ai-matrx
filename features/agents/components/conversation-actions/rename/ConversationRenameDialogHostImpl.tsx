"use client";

/**
 * The rename dialog itself: the canonical TextInputDialog, writing through the
 * one `renameConversationTitle` verb. Stays open (busy) while the write runs
 * and closes only when the title landed.
 */

import * as React from "react";
import { useOpenerHost } from "@ai-matrx/kit/opener-react";
import { TextInputDialog } from "@/components/dialogs/text-input/TextInputDialog";
import { useAppDispatch } from "@/lib/redux/hooks";
import { renameConversationTitle } from "../conversation-verbs";
import { conversationRenameOpener } from "./conversationRenameOpener";

export default function ConversationRenameDialogHostImpl() {
  const dispatch = useAppDispatch();
  const { request, open, settle } = useOpenerHost(conversationRenameOpener);
  const [busy, setBusy] = React.useState(false);

  return (
    <TextInputDialog
      key={request?.conversationId ?? "none"}
      open={open}
      onOpenChange={(next) => {
        if (!next && !busy) settle(false);
      }}
      title="Rename conversation"
      placeholder="Conversation name"
      defaultValue={request?.title ?? ""}
      confirmLabel="Rename"
      busy={busy}
      onConfirm={async (value) => {
        if (!request) return;
        setBusy(true);
        const ok = await renameConversationTitle(dispatch, request.conversationId, value);
        setBusy(false);
        if (ok) settle(true);
      }}
    />
  );
}
