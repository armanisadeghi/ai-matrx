"use client";

/**
 * UserActionBar — inline action buttons attached under a user message.
 *
 * Differs from the assistant bar in one way: no like / dislike (rating is for
 * model output, not your own input).
 *
 * "Edit" opens ONE full-screen editor whose footer offers three outcomes —
 * chosen directly, with NO follow-up confirmation dialog:
 *   • Save                 — correct the recorded message in place, no re-run
 *                            (transcript curation, typo fixes).
 *   • Save & Resubmit       — overwrite this turn, discard everything after it,
 *                            and re-run on the SAME conversation.
 *   • Create Fork           — branch at this message, apply the edit on the
 *                            branch, and re-run there; the original is intact.
 *
 * Both re-run outcomes leave the edited user message as the pending last turn
 * and fire `executeInstance({ retry: true })` — the same primitive as the
 * manual Retry button. Re-running (not re-sending `user_input`) is what makes
 * the fork path correct: it neither depends on post-navigation input state nor
 * duplicates the message.
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
import { DeleteMessageDialog } from "../message-options/DeleteMessageDialog";
import { extractErrorMessage } from "@/utils/errors";
import {
  USER_EDIT_ACTIONS,
  routeUserEditAction,
} from "../message-options/userEditActions";

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

  // Route a footer action from the edit modal to its flow — the shared
  // `routeUserEditAction` owns all three outcomes (save / resubmit / fork) and
  // its own error toasting, so the options-menu item and this bar can never
  // drift. Fires on the callback group when the user picks a footer button;
  // no follow-up confirmation dialog.
  const handleEditAction = useCallback(
    (actionId: string, newContent: string) => {
      void routeUserEditAction(dispatch, {
        actionId,
        conversationId,
        messageId,
        newContent,
        surfaceKey,
      });
    },
    [dispatch, conversationId, messageId, surfaceKey],
  );

  // ONE editor, three outcomes chosen from its footer (Save only / Save &
  // resubmit / Fork & resubmit). Both the pencil (Edit) and paper-plane (Edit &
  // resubmit) inline buttons open it — same modal, so there's never a second
  // button with surprising different behavior; the footer is where the user
  // picks. The `onAction` handler travels via the callback registry
  // (callbackGroupId), never through Redux; the bridge closes the editor
  // itself after emitting.
  const handleEdit = () => {
    openEditor({
      instanceId: `user-edit-${messageId}`,
      content,
      mode: "free",
      conversationId,
      messageId,
      onAction: handleEditAction,
      primaryActions: USER_EDIT_ACTIONS,
      tabs: ["write", "matrx_split", "markdown", "wysiwyg", "preview"],
      initialTab: "matrx_split",
      analysisData: metadata ?? undefined,
      showCopyButton: true,
    });
  };

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
          onClick={handleEdit}
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
