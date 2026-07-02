"use client";

/**
 * UserActionBar — inline action buttons attached under a user message.
 *
 * Differs from the assistant bar in two ways:
 *   1. No like / dislike — rating is for model output, not your own input.
 *   2. Adds "Edit & resubmit" — the common user action of re-asking a
 *      question with different wording. On editor save, the host opens the
 *      EditResubmitOutcomeDialog so the user can choose Fork (preserve
 *      original) or Overwrite (replace this turn and re-run on the same
 *      conversation). Either choice auto-fires the next agent turn.
 *
 * Plain "Edit" is also present — use it when you want to correct the
 * recorded user message WITHOUT re-running the AI (for transcript
 * curation, typo fixes, etc.).
 *
 * The action bar also owns the destructive delete dialog state (so the
 * overflow-menu Delete item just calls back into this component to open
 * it). That keeps dialog ownership in one place per message bubble.
 */

import React, { useRef, useState, lazy, Suspense, useCallback } from "react";
import { Copy, Check, Edit, Send, MoreHorizontal } from "lucide-react";
import {
  TapTargetButtonForGroup,
  TapTargetButtonGroup,
} from "@/components/icons/TapTargetButton";
import { copyToClipboard } from "@/components/matrx/buttons/markdown-copy-utils";
import { SpeakerButton } from "@/features/tts/components/SpeakerButton";
import { useAppDispatch, useAppSelector, useAppStore } from "@/lib/redux/hooks";
import { useOpenFullScreenMarkdownEditorBridge } from "@/features/overlays/openers/fullScreenEditor";
import { selectMessagePosition } from "@/features/agents/redux/execution-system/messages/messages.selectors";
import { selectShowUserMessageOptions } from "@/features/agents/redux/execution-system/instance-ui-state/instance-ui-state.selectors";
import { toast } from "sonner";
import { EditResubmitOutcomeDialog } from "../message-options/EditResubmitOutcomeDialog";
import { DeleteMessageDialog } from "../message-options/DeleteMessageDialog";
import { extractErrorMessage } from "@/utils/errors";

function serializeSaveError(error: unknown): {
  logPayload: Record<string, unknown>;
  message: string;
} {
  if (error instanceof Error) {
    return {
      logPayload: {
        name: error.name,
        message: error.message,
        stack: error.stack,
      },
      message: error.message || "Save failed",
    };
  }
  if (error && typeof error === "object") {
    const e = error as Record<string, unknown>;
    const message =
      (typeof e.message === "string" && e.message) ||
      (typeof e.details === "string" && e.details) ||
      (typeof e.hint === "string" && e.hint) ||
      "Save failed";
    return {
      logPayload: {
        code: e.code ?? null,
        message: e.message ?? null,
        details: e.details ?? null,
        hint: e.hint ?? null,
        status: e.status ?? null,
        name: e.name ?? null,
      },
      message,
    };
  }
  return {
    logPayload: { raw: extractErrorMessage(error) },
    message: "Save failed",
  };
}

const MessageOptionsMenu = lazy(() =>
  import("../message-options/MessageOptionsMenu").then((m) => ({
    default: m.MessageOptionsMenu,
  })),
);

export interface UserActionBarProps {
  /** Flat-text rendering of the user's message. */
  content: string;
  /** Server `cx_message.id` (or client temp id for an optimistic message). */
  messageId: string;
  /** Server `cx_conversation.id`. */
  conversationId: string;
  /** Optional metadata (passed to the overflow menu's save/export items). */
  metadata?: Record<string, unknown> | null;
  /**
   * UI surface this action bar belongs to. Threaded into the overflow
   * menu so fork / delete / edit-and-resubmit outcomes route correctly
   * via the surfaces registry. Optional — falls back to no navigation
   * when omitted (e.g. when embedded outside a registered surface).
   */
  surfaceKey?: string;
}

export function UserActionBar({
  content,
  messageId,
  conversationId,
  metadata = null,
  surfaceKey,
}: UserActionBarProps) {
  const dispatch = useAppDispatch();
  const store = useAppStore();
  const openEditor = useOpenFullScreenMarkdownEditorBridge();

  const [isCopied, setIsCopied] = useState(false);
  const [showOptionsMenu, setShowOptionsMenu] = useState(false);
  const moreOptionsButtonRef = useRef<HTMLDivElement>(null);

  // ── Edit & resubmit dialog state ──────────────────────────────────────
  // Opens AFTER the editor closes with new content. The dialog asks the
  // user whether to fork (preserve) or overwrite (replace + re-run).
  const [resubmitDialogOpen, setResubmitDialogOpen] = useState(false);
  const [pendingResubmitContent, setPendingResubmitContent] = useState<
    string | null
  >(null);

  // ── Delete dialog state ────────────────────────────────────────────────
  // Triggered from the overflow menu's "Delete message" item. Owns the
  // destructive-vs-fork choice + cascade warning.
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  const messagePosition = useAppSelector(
    selectMessagePosition(conversationId, messageId),
  );
  const showOptions = useAppSelector(
    selectShowUserMessageOptions(conversationId),
  );

  const handleCopy = async () => {
    await copyToClipboard(content, {
      onSuccess: () => {
        setIsCopied(true);
        setTimeout(() => setIsCopied(false), 2000);
      },
      onError: (err) => console.error("Failed to copy:", err),
    });
  };

  const handleEdit = () => {
    // Plain edit — overwrite the stored content in place, no fork, no resubmit.
    // No `onSave`: the bridge self-handles via `editMessage` (preserving any
    // attachment blocks) because we pass conversationId + messageId.
    openEditor({
      instanceId: `user-edit-${messageId}`,
      content,
      mode: "free",
      conversationId,
      messageId,
      tabs: ["write", "matrx_split", "markdown", "wysiwyg", "preview"],
      initialTab: "matrx_split",
      analysisData: metadata ?? undefined,
      showSaveButton: true,
      showCopyButton: true,
    });
  };

  const handleEditAndResubmit = () => {
    // Open the editor. On save, stash the new content + open the
    // fork-vs-overwrite choice dialog. The dialog runs the chosen flow
    // and auto-fires the next agent turn so the user can watch the new
    // response come in. The `onSave` callback travels via the callback
    // registry (callbackGroupId), never through Redux. The bridge closes
    // the editor itself after emitting.
    openEditor({
      instanceId: `user-edit-resubmit-${messageId}`,
      content,
      mode: "free",
      conversationId,
      messageId,
      onSave: (newContent: string) => {
        setPendingResubmitContent(newContent);
        setResubmitDialogOpen(true);
      },
      tabs: ["write", "matrx_split", "markdown", "wysiwyg", "preview"],
      initialTab: "matrx_split",
      analysisData: metadata ?? undefined,
      showSaveButton: true,
      showCopyButton: true,
    });
  };

  const handleResubmitChooseFork = useCallback(async () => {
    if (pendingResubmitContent == null) return;
    const newContent = pendingResubmitContent;
    setPendingResubmitContent(null);

    try {
      const { forkConversation } =
        await import("@/features/agents/redux/execution-system/message-crud/fork-conversation.thunk");
      const { editMessage } =
        await import("@/features/agents/redux/execution-system/message-crud/edit-message.thunk");
      const { executeInstance } =
        await import("@/features/agents/redux/execution-system/thunks/execute-instance.thunk");
      const { setUserInputText } =
        await import("@/features/agents/redux/execution-system/instance-user-input/instance-user-input.slice");

      // Fork at the edited message's OWN position so the fork INCLUDES it
      // (everything up to and including this user message; the assistant reply
      // after it — position+1 — is naturally excluded). Forking at position-1
      // would exclude the message, and the lookup below would never find it —
      // the silent "Edit & resubmit → Fork does nothing" bug for any message
      // past the first turn. This mirrors the working Overwrite path (edit in
      // place, then re-run), just on a branch.
      const forkPosition = messagePosition ?? 0;
      const forkResult = await dispatch(
        forkConversation({
          conversationId,
          atPosition: forkPosition,
        }),
      ).unwrap();
      const newConversationId = forkResult.conversationId;

      // forkConversation hydrates the new conversation's messages before
      // resolving. The user message we want to edit was at `messagePosition`
      // in the source; the duplicated row sits at the same position on the
      // fork with a fresh id. Look it up via a thunk-style read.
      const forkedMessagesEntry =
        store.getState().messages.byConversationId[newConversationId];
      const findEditedMessageId = forkedMessagesEntry
        ? (Object.values(forkedMessagesEntry.byId).find(
            (m) => m.role === "user" && m.position === (messagePosition ?? 0),
          )?.id ?? null)
        : null;

      if (typeof findEditedMessageId !== "string") {
        toast.error("Couldn't find the edited message on the new fork");
        return;
      }

      const { mergeEditedText } =
        await import("@/features/agents/redux/execution-system/message-crud/content-blocks.util");
      const forkedExisting = store.getState().messages.byConversationId[
        newConversationId
      ]?.byId?.[findEditedMessageId]?.content;

      await dispatch(
        editMessage({
          conversationId: newConversationId,
          messageId: findEditedMessageId,
          newContent: mergeEditedText(forkedExisting, newContent),
        }),
      ).unwrap();

      // Surface the new conversation BEFORE firing the turn so the
      // streaming bubble lands in the right place. The user edited
      // a message and explicitly chose "fork and resubmit", so we
      // auto-navigate — no extra prompt. If we're embedded without a
      // registered surface (rare), `requestSurfaceNavigation` no-ops
      // and we drop a passive toast so the user can still find the
      // new branch from the conversation sidebar.
      if (surfaceKey) {
        const { requestSurfaceNavigation } =
          await import("@/features/agents/redux/surfaces/request-surface-navigation.thunk");
        await dispatch(
          requestSurfaceNavigation({
            surfaceKey,
            conversationId: newConversationId,
            reason: "fork",
          }),
        );
      } else {
        toast.success("Branch created — open it from the conversation sidebar");
      }

      dispatch(
        setUserInputText({
          conversationId: newConversationId,
          text: newContent,
        }),
      );
      void dispatch(executeInstance({ conversationId: newConversationId }));
    } catch (err) {
      const { logPayload, message } = serializeSaveError(err);
      // eslint-disable-next-line no-console
      console.error(
        "[UserActionBar] fork edit-and-resubmit failed",
        JSON.stringify(logPayload, null, 2),
      );
      toast.error(message);
    }
  }, [
    pendingResubmitContent,
    dispatch,
    conversationId,
    messagePosition,
    surfaceKey,
  ]);

  const handleResubmitChooseOverwrite = useCallback(async () => {
    if (pendingResubmitContent == null) return;
    const newContent = pendingResubmitContent;
    setPendingResubmitContent(null);

    try {
      const { overwriteAndResend } =
        await import("@/features/agents/redux/execution-system/message-crud/overwrite-and-resend.thunk");
      await dispatch(
        overwriteAndResend({
          conversationId,
          messageId,
          newContent,
        }),
      ).unwrap();
    } catch (err) {
      const { logPayload, message } = serializeSaveError(err);
      // eslint-disable-next-line no-console
      console.error(
        "[UserActionBar] overwrite-and-resend failed",
        JSON.stringify(logPayload, null, 2),
      );
      toast.error(message);
    }
  }, [pendingResubmitContent, dispatch, conversationId, messageId]);

  const handleConfirmDelete = useCallback(async () => {
    try {
      const { deleteMessage } =
        await import("@/features/agents/redux/execution-system/message-crud/delete-message.thunk");
      await dispatch(deleteMessage({ conversationId, messageId })).unwrap();
      toast.success("Message deleted");
    } catch (err) {
      const { logPayload, message } = serializeSaveError(err);
      // eslint-disable-next-line no-console
      console.error(
        "[UserActionBar] delete failed",
        JSON.stringify(logPayload, null, 2),
      );
      toast.error(message);
    }
  }, [dispatch, conversationId, messageId]);

  const handleConfirmDeleteFork = useCallback(async () => {
    try {
      const { forkConversation } =
        await import("@/features/agents/redux/execution-system/message-crud/fork-conversation.thunk");
      const { deleteMessage } =
        await import("@/features/agents/redux/execution-system/message-crud/delete-message.thunk");
      const forkPosition = Math.max(0, (messagePosition ?? 0) - 1);
      const forkResult = await dispatch(
        forkConversation({ conversationId, atPosition: forkPosition }),
      ).unwrap();
      const newConversationId = forkResult.conversationId;

      // Find the duplicated user message on the fork at the same position.
      const forkedEntry =
        store.getState().messages.byConversationId[newConversationId];
      const findCopiedId = forkedEntry
        ? (Object.values(forkedEntry.byId).find(
            (m) => m.position === (messagePosition ?? 0),
          )?.id ?? null)
        : null;

      if (typeof findCopiedId === "string") {
        await dispatch(
          deleteMessage({
            conversationId: newConversationId,
            messageId: findCopiedId,
          }),
        ).unwrap();
      }

      if (surfaceKey) {
        const { requestSurfaceNavigation } =
          await import("@/features/agents/redux/surfaces/request-surface-navigation.thunk");
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
      const { logPayload, message } = serializeSaveError(err);
      // eslint-disable-next-line no-console
      console.error(
        "[UserActionBar] fork-and-delete failed",
        JSON.stringify(logPayload, null, 2),
      );
      toast.error(message);
    }
  }, [dispatch, conversationId, messagePosition, surfaceKey]);

  // The "Fork without this message" path needs a position - 1 anchor;
  // when this is the very first message there's nowhere to fork before it.
  const canFork = (messagePosition ?? 0) > 0;

  return (
    <>
      <TapTargetButtonGroup>
        <TapTargetButtonForGroup
          onClick={handleCopy}
          ariaLabel="Copy message"
          icon={
            isCopied ? (
              <Check className="w-4 h-4 text-blue-500 dark:text-blue-400" />
            ) : (
              <Copy className="w-4 h-4 text-muted-foreground" />
            )
          }
        />

        <SpeakerButton text={content} variant="group" />

        <TapTargetButtonForGroup
          onClick={handleEdit}
          ariaLabel="Edit message"
          icon={<Edit className="w-4 h-4 text-muted-foreground" />}
        />

        <TapTargetButtonForGroup
          onClick={handleEditAndResubmit}
          ariaLabel="Edit and resubmit"
          icon={<Send className="w-4 h-4 text-cyan-500 dark:text-cyan-400" />}
        />

        {showOptions && (
          <div ref={moreOptionsButtonRef}>
            <TapTargetButtonForGroup
              onClick={() => setShowOptionsMenu(true)}
              ariaLabel="More options"
              icon={
                <MoreHorizontal className="w-4 h-4 text-muted-foreground" />
              }
            />
          </div>
        )}
      </TapTargetButtonGroup>

      {showOptions && showOptionsMenu && (
        <Suspense fallback={null}>
          <MessageOptionsMenu
            role="user"
            isOpen={showOptionsMenu}
            onClose={() => setShowOptionsMenu(false)}
            content={content}
            messageId={messageId}
            conversationId={conversationId}
            metadata={metadata}
            anchorElement={moreOptionsButtonRef.current}
            surfaceKey={surfaceKey}
            onRequestDelete={() => setDeleteDialogOpen(true)}
          />
        </Suspense>
      )}

      <EditResubmitOutcomeDialog
        open={resubmitDialogOpen}
        onOpenChange={(open) => {
          setResubmitDialogOpen(open);
          if (!open) setPendingResubmitContent(null);
        }}
        onChooseFork={handleResubmitChooseFork}
        onChooseOverwrite={handleResubmitChooseOverwrite}
      />

      <DeleteMessageDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        messageId={messageId}
        canFork={canFork}
        onConfirmDelete={handleConfirmDelete}
        onConfirmFork={handleConfirmDeleteFork}
      />
    </>
  );
}
