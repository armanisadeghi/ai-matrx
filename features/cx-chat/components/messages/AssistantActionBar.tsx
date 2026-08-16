"use client";

import React, {
  useState,
  useRef,
  useEffect,
  useId,
  lazy,
  Suspense,
} from "react";
import {
  ThumbsUp,
  ThumbsDown,
  Copy,
  Check,
  Edit,
  MoreHorizontal,
  Loader2,
  Save,
} from "lucide-react";
import {
  TapTargetButtonForGroup,
  TapTargetButtonGroup,
} from "@/components/icons/TapTargetButton";
import { SpeakerButton } from "@/features/tts/components/SpeakerButton";
import { copyToClipboard } from "@/components/matrx/buttons/markdown-copy-utils";
import { useAppDispatch } from "@/lib/redux/hooks";
import { messageActionsActions } from "@/features/agents/redux/execution-system/message-actions/message-actions.slice";
import { openOverlay } from "@/lib/redux/slices/overlaySlice";
import { useOutputFeedback } from "@/lib/output-feedback/useOutputFeedback";
import { NegativeVerdictFollowUp } from "@/features/review-walk/components/NegativeVerdictFollowUp";
import { toast } from "@/lib/toast";

const ConversationMessageOptionsMenu = lazy(
  () => import("./MessageOptionsMenu"),
);

export interface AssistantActionBarProps {
  content: string;
  messageId: string;
  sessionId?: string;
  conversationId?: string;
  hasUnsavedChanges?: boolean;
  isSaving?: boolean;
  rawContent?: unknown[];
  onQuickSave?: () => void;
  onFullPrint?: () => void;
  isCapturing?: boolean;
}

export function AssistantActionBar({
  content,
  messageId,
  sessionId,
  conversationId,
  hasUnsavedChanges = false,
  isSaving = false,
  rawContent,
  onQuickSave,
  onFullPrint,
  isCapturing,
}: AssistantActionBarProps) {
  const dispatch = useAppDispatch();
  const reactId = useId();
  const instanceId = useRef(`msg-action-${reactId}`).current;

  const [isCopied, setIsCopied] = useState(false);
  const [showOptionsMenu, setShowOptionsMenu] = useState(false);

  // Until 2026-08-15 these thumbs were local `useState` — they lit up and the
  // signal died with the component. They now write the ONE destination,
  // `platform.output_feedback`, exactly like the /chat bar does.
  const { verdict, setVerdict } = useOutputFeedback({
    subjectType: "message",
    subjectId: messageId,
    surfaceName: "cx-chat",
    originalContent: content,
  });
  const handleVerdict = (clicked: "positive" | "negative") => {
    void setVerdict(clicked).catch(() => toast.error("Failed to save feedback"));
  };
  const moreOptionsButtonRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    dispatch(
      messageActionsActions.registerInstance({
        id: instanceId,
        context: {
          content,
          messageId,
          sessionId: sessionId ?? "",
          conversationId: conversationId ?? null,
          rawContent: rawContent ?? null,
          metadata: null,
        },
      }),
    );
    return () => {
      dispatch(messageActionsActions.unregisterInstance(instanceId));
    };
  }, [instanceId, dispatch]);

  useEffect(() => {
    dispatch(
      messageActionsActions.updateInstanceContext({
        id: instanceId,
        updates: {
          content,
          messageId,
          sessionId: sessionId ?? "",
          conversationId: conversationId ?? null,
          rawContent: rawContent ?? null,
        },
      }),
    );
  }, [
    content,
    messageId,
    sessionId,
    conversationId,
    rawContent,
    instanceId,
    dispatch,
  ]);

  const handleCopy = async () => {
    try {
      await copyToClipboard(content, {
        onSuccess: () => {
          setIsCopied(true);
          setTimeout(() => setIsCopied(false), 2000);
        },
        onError: (err) => console.error("Failed to copy:", err),
      });
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  const handleEdit = () => {
    const editInstanceId = `cx-assistant-edit-${messageId}`;
    dispatch(
      openOverlay({
        overlayId: "fullScreenEditor",
        instanceId: editInstanceId,
        data: {
          content,
          mode: "free",
          conversationId: undefined,
          messageId,
          // No `onSave` in data — a function can't survive Redux (the
          // overlaySlice guard strips it loudly), and the old handler only
          // dispatched the no-op `chatConversationsActions` stub. With no
          // conversationId there is no self-handle target either, so Save is
          // hidden until the cx-chat refactor wires a real save (via the
          // callback registry — see openers/fullScreenEditor).
          tabs: ["write", "matrx_split", "markdown", "wysiwyg", "preview"],
          initialTab: "matrx_split",
          analysisData: undefined,
          title: undefined,
          showSaveButton: false,
          showCopyButton: true,
        },
      }),
    );
  };

  return (
    <>
      <TapTargetButtonGroup>
        <TapTargetButtonForGroup
          onClick={() => handleVerdict("positive")}
          ariaLabel="Like message"
          icon={
            <ThumbsUp
              className={`w-4 h-4 ${verdict === "positive" ? "text-green-500 dark:text-green-400" : "text-muted-foreground"}`}
            />
          }
        />

        <TapTargetButtonForGroup
          onClick={() => handleVerdict("negative")}
          ariaLabel="Dislike message"
          icon={
            <ThumbsDown
              className={`w-4 h-4 ${verdict === "negative" ? "text-red-500 dark:text-red-400" : "text-muted-foreground"}`}
            />
          }
        />

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

        {hasUnsavedChanges && (
          <TapTargetButtonForGroup
            onClick={onQuickSave}
            ariaLabel="Save changes"
            icon={
              isSaving ? (
                <Loader2 className="w-4 h-4 text-primary animate-spin" />
              ) : (
                <Save className="w-4 h-4 text-primary" />
              )
            }
          />
        )}

        <TapTargetButtonForGroup
          onClick={handleEdit}
          ariaLabel="Edit message"
          icon={<Edit className="w-4 h-4 text-muted-foreground" />}
        />

        <div ref={moreOptionsButtonRef}>
          <TapTargetButtonForGroup
            onClick={() => setShowOptionsMenu(true)}
            ariaLabel="More options"
            icon={<MoreHorizontal className="w-4 h-4 text-muted-foreground" />}
          />
        </div>
      </TapTargetButtonGroup>

      {/* Negative-verdict follow-up strip — same ONE surface as the /chat
          bar: [Diagnose] opens the drill-down review walk; [Attach your
          version] captures the O1 correction. Reads the same
          output-feedback store the thumbs above write. */}
      <NegativeVerdictFollowUp
        messageId={messageId}
        content={content}
        surfaceName="cx-chat"
        className="mt-1"
      />

      {showOptionsMenu && (
        <Suspense fallback={null}>
          <ConversationMessageOptionsMenu
            isOpen={showOptionsMenu}
            instanceId={instanceId}
            onClose={() => setShowOptionsMenu(false)}
            anchorElement={moreOptionsButtonRef.current}
            showFullPrint={!!onFullPrint}
            onFullPrint={onFullPrint}
            isCapturing={isCapturing}
          />
        </Suspense>
      )}
    </>
  );
}
