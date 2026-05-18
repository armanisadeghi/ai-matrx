"use client";

/**
 * AssistantActionBar — inline action buttons attached under an assistant
 * message.
 *
 * **id-only contract.** This component receives only `messageId` +
 * `conversationId` (plus optional surface metadata for routing). Everything
 * else — content, metadata, position — is selected from Redux internally.
 * No prop-drilled content/metadata, no callbacks dispatched as Redux
 * payloads. Edit save goes through the typed `mode: "assistant-message"`
 * path on `openFullScreenEditor`; the OverlayController dispatches
 * `editMessage` on submit. There is no `onSave` closure stored in state.
 *
 * The overflow menu (⋯) is loaded lazily and uses `role="assistant"` so
 * Edit & Resubmit (a user-message-only flow) is hidden.
 */

import React, {
  useState,
  useRef,
  useCallback,
  lazy,
  Suspense,
  useMemo,
} from "react";
import { TapTargetButtonGroup } from "@/components/icons/TapTargetButton";
import {
  ThumbsUpTapButton,
  ThumbsDownTapButton,
  CopyTapButton,
  CheckTapButton,
  PencilTapButton,
  MoreHorizontalTapButton,
} from "@/components/icons/tap-buttons";
import { StreamingSpeakerButton } from "@/features/tts/components/StreamingSpeakerButton";
import { copyToClipboard } from "@/components/matrx/buttons/markdown-copy-utils";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { openOverlay } from "@/lib/redux/slices/overlaySlice";
import { toast } from "sonner";
import {
  selectMessageById,
  selectMessagePosition,
  selectIsLatestAssistantMessage,
  extractFlatText,
} from "@/features/agents/redux/execution-system/messages/messages.selectors";
import type { RootState } from "@/lib/redux/store";
import {
  selectResponseDensity,
  selectShowAssistantMessageOptions,
} from "@/features/agents/redux/execution-system/instance-ui-state/instance-ui-state.selectors";
import { cn } from "@/lib/utils";
import { DeleteMessageDialog } from "../message-options/DeleteMessageDialog";
import { EditHistoryDialog } from "../message-options/EditHistoryDialog";
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

export interface AssistantActionBarProps {
  /** Server `cx_message.id`. */
  messageId: string;
  /** Server `cx_conversation.id`. */
  conversationId: string;
  /** Full-page print handler (DOM capture to PDF). */
  onFullPrint?: () => void;
  isCapturing?: boolean;
  /**
   * UI surface this action bar belongs to. Forwarded to the overflow
   * menu so fork / delete outcomes route correctly via the surfaces
   * registry. Optional — falls back to no navigation when omitted.
   */
  surfaceKey?: string;
  /**
   * When this bar is rendered at the end of a multi-message AssistantTurnGroup
   * (multi-iteration agentic turn), `groupMessageIds` carries every
   * assistant `cx_message.id` in the group in transcript order. Used to
   * aggregate text across iterations for Copy / Speak — the user sees one
   * cohesive turn, so copying should grab the whole turn, not just the
   * final iteration. Edit / Like / Delete remain anchored to `messageId`
   * (the latest assistant message — the user-visible answer).
   *
   * When omitted, behavior is identical to pre-grouping (single-message).
   */
  groupMessageIds?: string[];
}

export function AssistantActionBar({
  messageId,
  conversationId,
  onFullPrint,
  isCapturing,
  surfaceKey,
  groupMessageIds,
}: AssistantActionBarProps) {
  const dispatch = useAppDispatch();
  const [isCopied, setIsCopied] = useState(false);
  const [isLiked, setIsLiked] = useState(false);
  const [isDisliked, setIsDisliked] = useState(false);
  const [showOptionsMenu, setShowOptionsMenu] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editHistoryOpen, setEditHistoryOpen] = useState(false);
  const moreOptionsButtonRef = useRef<HTMLDivElement>(null);

  // Single subscription to the message record. Everything below derives.
  const record = useAppSelector(selectMessageById(conversationId, messageId));
  const messagePosition = useAppSelector(
    selectMessagePosition(conversationId, messageId),
  );
  const density = useAppSelector(selectResponseDensity(conversationId));
  const showOptions = useAppSelector(
    selectShowAssistantMessageOptions(conversationId),
  );
  const isLatestAssistant = useAppSelector(
    selectIsLatestAssistantMessage(conversationId, messageId),
  );

  const content = useMemo(() => extractFlatText(record), [record]);
  // Count of archived versions on this message — surfaces the "Edit
  // history (N)" item only when there's something recoverable.
  const contentHistoryCount = useMemo(() => {
    const raw = record?.contentHistory;
    return Array.isArray(raw) ? raw.length : 0;
  }, [record?.contentHistory]);
  const metadata = useMemo<Record<string, unknown> | null>(
    () =>
      record?.metadata ? (record.metadata as Record<string, unknown>) : null,
    [record?.metadata],
  );

  // For multi-iteration agentic turns, the surrounding AssistantTurnGroup
  // passes the full chain of assistant message ids. Pull all their records
  // and concatenate their flat text — Copy / Speak then cover the whole
  // logical turn instead of just the final iteration.
  //
  // Subscribing to `byId` is fine here: this component is rendered only
  // once per group (not per iteration), and the bar is hidden while the
  // turn is streaming (`!isStreamActive` gate in AgentAssistantMessage),
  // so stream-time mutations never cause a re-render anyway.
  const byId = useAppSelector(
    (state: RootState) => state.messages.byConversationId[conversationId]?.byId,
  );
  const aggregatedContent = useMemo(() => {
    if (!groupMessageIds || groupMessageIds.length <= 1 || !byId) return null;
    let out = "";
    for (const id of groupMessageIds) {
      const rec = byId[id];
      const text = extractFlatText(rec);
      if (!text) continue;
      if (out.length > 0) out += "\n\n";
      out += text;
    }
    return out.length > 0 ? out : null;
  }, [groupMessageIds, byId]);

  // Copy / Speak target the whole turn; Edit / notes / overflow-menu stay
  // anchored to the latest message (`content`) because those flows want
  // "the answer", not the multi-step trace.
  const copySpeakContent = aggregatedContent ?? content;

  // In compact (agentic) density, hide the action bar by default for any
  // assistant turn that has another assistant turn after it. The latest
  // assistant always stays visible — that's the active answer the user
  // reads. Hover the message group to reveal the bar for older turns.
  const isHoverOnly = density === "compact" && !isLatestAssistant;

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
        "[AssistantActionBar] delete failed",
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

      const findCopiedId = dispatch(((
        _: unknown,
        getState: () => import("@/lib/redux/store").RootState,
      ) => {
        const entry = getState().messages.byConversationId[newConversationId];
        if (!entry) return null;
        const match = Object.values(entry.byId).find(
          (m) => m.position === (messagePosition ?? 0),
        );
        return match?.id ?? null;
      }) as never) as unknown as string | null;

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
        "[AssistantActionBar] fork-and-delete failed",
        JSON.stringify(logPayload, null, 2),
      );
      toast.error(message);
    }
  }, [dispatch, conversationId, messagePosition, surfaceKey]);

  const canFork = (messagePosition ?? 0) > 0;

  const handleCopy = async () => {
    await copyToClipboard(copySpeakContent, {
      onSuccess: () => {
        setIsCopied(true);
        setTimeout(() => setIsCopied(false), 2000);
      },
      onError: (err) => console.error("Failed to copy:", err),
    });
  };

  // Edit goes through the mode-based path. The OverlayController dispatches
  // editMessage on save — no closure stored in Redux, no freeze.
  const handleEdit = () => {
    dispatch(
      openOverlay({
        overlayId: "fullScreenEditor",
        instanceId: `assistant-edit-${messageId}`,
        data: {
          content,
          mode: "assistant-message",
          conversationId,
          messageId,
          onSave: undefined,
          tabs: ["write", "matrx_split", "markdown", "wysiwyg", "preview"],
          initialTab: "matrx_split",
          analysisData: metadata ?? undefined,
          title: undefined,
          showSaveButton: true,
          showCopyButton: true,
        },
      }),
    );
  };

  return (
    <>
      <div
        className={cn(
          "transition-opacity",
          isHoverOnly &&
            "opacity-0 group-hover/assistant-msg:opacity-100 focus-within:opacity-100",
        )}
      >
        <TapTargetButtonGroup>
          <ThumbsUpTapButton
            variant="group"
            onClick={() => {
              setIsLiked(!isLiked);
              if (isDisliked) setIsDisliked(false);
            }}
            ariaLabel="Like message"
            className={
              isLiked
                ? "text-green-500 dark:text-green-400"
                : "text-muted-foreground"
            }
          />

          <ThumbsDownTapButton
            variant="group"
            onClick={() => {
              setIsDisliked(!isDisliked);
              if (isLiked) setIsLiked(false);
            }}
            ariaLabel="Dislike message"
            className={
              isDisliked
                ? "text-red-500 dark:text-red-400"
                : "text-muted-foreground"
            }
          />

          {isCopied ? (
            <CheckTapButton
              variant="group"
              onClick={handleCopy}
              ariaLabel="Copied"
              className="text-blue-500 dark:text-blue-400"
            />
          ) : (
            <CopyTapButton
              variant="group"
              onClick={handleCopy}
              ariaLabel="Copy message"
              className="text-muted-foreground"
            />
          )}

          <StreamingSpeakerButton text={copySpeakContent} variant="group" />

          <PencilTapButton
            variant="group"
            onClick={handleEdit}
            ariaLabel="Edit message"
            className="text-muted-foreground"
          />

          {showOptions && (
            <div ref={moreOptionsButtonRef}>
              <MoreHorizontalTapButton
                variant="group"
                onClick={() => setShowOptionsMenu(true)}
                ariaLabel="More options"
                className="text-muted-foreground"
              />
            </div>
          )}
        </TapTargetButtonGroup>
      </div>

      {showOptions && showOptionsMenu && (
        <Suspense fallback={null}>
          <MessageOptionsMenu
            role="assistant"
            isOpen={showOptionsMenu}
            onClose={() => setShowOptionsMenu(false)}
            content={content}
            messageId={messageId}
            conversationId={conversationId}
            metadata={metadata}
            anchorElement={moreOptionsButtonRef.current}
            showFullPrint={!!onFullPrint}
            onFullPrint={onFullPrint}
            isCapturing={isCapturing}
            surfaceKey={surfaceKey}
            onRequestDelete={() => setDeleteDialogOpen(true)}
            onRequestEditHistory={() => setEditHistoryOpen(true)}
            contentHistoryCount={contentHistoryCount}
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

      <EditHistoryDialog
        open={editHistoryOpen}
        onOpenChange={setEditHistoryOpen}
        conversationId={conversationId}
        messageId={messageId}
      />
    </>
  );
}
