"use client";

// features/rich-document/hosts/ChatMessageDialogs.tsx
//
// The chat-turn dialogs the registry's `delete-message` and `edit-history`
// actions ask for — hosted by the ONE document dialogs host, so any surface
// that shows a chat turn (the /chat footer, a chat message on the proving
// route) gets them without a bespoke bar. Moved here verbatim from the
// deleted /chat AssistantActionBar (RC-B6).

import * as React from "react";
import { useAppDispatch, useAppStore } from "@/lib/redux/hooks";
import { toast } from "@/lib/toast";
import { extractErrorMessage } from "@/utils/errors";
import { selectMessagePosition } from "@/features/agents/redux/execution-system/messages/messages.selectors";
import { DeleteMessageDialog } from "@/features/agents/components/messages-display/message-options/DeleteMessageDialog";
import { EditHistoryDialog } from "@/features/agents/components/messages-display/message-options/EditHistoryDialog";

function errorText(error: unknown): string {
  if (error instanceof Error) return error.message || "Save failed";
  if (error && typeof error === "object") {
    const e = error as Record<string, unknown>;
    return (
      (typeof e.message === "string" && e.message) ||
      (typeof e.details === "string" && e.details) ||
      (typeof e.hint === "string" && e.hint) ||
      "Save failed"
    );
  }
  return extractErrorMessage(error) || "Save failed";
}

export interface ChatMessageDialogsProps {
  dialog: "delete" | "history";
  conversationId: string;
  messageId: string;
  surfaceKey: string | null;
  onClose: () => void;
}

export function ChatMessageDialogs({
  dialog,
  conversationId,
  messageId,
  surfaceKey,
  onClose,
}: ChatMessageDialogsProps): React.ReactElement {
  const dispatch = useAppDispatch();
  const store = useAppStore();
  const messagePosition =
    selectMessagePosition(conversationId, messageId)(store.getState()) ?? 0;

  const confirmDelete = async () => {
    try {
      const { deleteMessage } = await import(
        "@/features/agents/redux/execution-system/message-crud/delete-message.thunk"
      );
      await dispatch(deleteMessage({ conversationId, messageId })).unwrap();
      toast.success("Message deleted");
    } catch (err) {
      console.error("[ChatMessageDialogs] delete failed", err);
      toast.error(errorText(err));
    }
  };

  // Fork WITHOUT this message: fork just before it, then delete its copy on
  // the branch, then move the surface to the branch.
  const confirmDeleteFork = async () => {
    try {
      const { forkConversation } = await import(
        "@/features/agents/redux/execution-system/message-crud/fork-conversation.thunk"
      );
      const { deleteMessage } = await import(
        "@/features/agents/redux/execution-system/message-crud/delete-message.thunk"
      );
      const forkResult = await dispatch(
        forkConversation({
          conversationId,
          atPosition: Math.max(0, messagePosition - 1),
        }),
      ).unwrap();
      const newConversationId = forkResult.conversationId;
      const forked = store.getState().messages.byConversationId[newConversationId];
      const copiedId = forked
        ? (Object.values(forked.byId).find((m) => m.position === messagePosition)
            ?.id ?? null)
        : null;
      if (typeof copiedId === "string") {
        await dispatch(
          deleteMessage({ conversationId: newConversationId, messageId: copiedId }),
        ).unwrap();
      }
      if (surfaceKey) {
        const { requestSurfaceNavigation } = await import(
          "@/features/agents/redux/surfaces/request-surface-navigation.thunk"
        );
        await dispatch(
          requestSurfaceNavigation({
            surfaceKey,
            conversationId: newConversationId,
            reason: "fork",
          }),
        );
      }
      toast.success("Forked without this message");
    } catch (err) {
      console.error("[ChatMessageDialogs] fork-and-delete failed", err);
      toast.error(errorText(err));
    }
  };

  if (dialog === "history") {
    return (
      <EditHistoryDialog
        open
        onOpenChange={(open) => !open && onClose()}
        conversationId={conversationId}
        messageId={messageId}
      />
    );
  }
  return (
    <DeleteMessageDialog
      open
      onOpenChange={(open) => !open && onClose()}
      messageId={messageId}
      canFork={messagePosition > 0}
      onConfirmDelete={confirmDelete}
      onConfirmFork={confirmDeleteFork}
    />
  );
}

export default ChatMessageDialogs;
