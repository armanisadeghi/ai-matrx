"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Volume2,
  Download,
  Link as LinkIcon,
  Loader2,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import MarkdownStream from "@/components/MarkdownStream";
import AudioOutputBlockSkeleton from "@/components/mardown-display/blocks/audio/AudioOutputBlockSkeleton";
import { useDomCapturePrint } from "@/features/conversation/hooks/useDomCapturePrint";
import { useAppSelector, useAppDispatch } from "@/lib/redux/hooks";
import {
  selectMessageHasUnsavedChanges,
  selectMessageHasHistory,
} from "../../_legacy-stubs";
import { editMessage } from "../../_legacy-stubs";
import { buildContentBlocksForSave } from "@/features/cx-chat/utils/buildContentBlocksForSave";
import { useRemintableSrc } from "@/features/files/handler/hooks/useRemintableSrc";
import { chatConversationsActions } from "../../_legacy-stubs";
import { AssistantActionBar } from "./AssistantActionBar";
import type { ConversationMessage } from "@/features/cx-chat/types/conversation";

// ============================================================================
// PROPS
// ============================================================================

export interface AssistantMessageProps {
  message: ConversationMessage;
  sessionId?: string;
  isStreamActive?: boolean;
  compact?: boolean;
  isOverlay?: boolean;
  isTtsRequest?: boolean;
  onContentChange?: (messageId: string, newContent: string) => void;
}

// ============================================================================
// COMPONENT
// ============================================================================

export function AssistantMessage({
  message,
  sessionId,
  isStreamActive = false,
  compact = false,
  isOverlay = false,
  isTtsRequest = false,
  onContentChange,
}: AssistantMessageProps) {
  const [isAppearing, setIsAppearing] = useState(true);
  const [isAudioLinkCopied, setIsAudioLinkCopied] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const dispatch = useAppDispatch();
  const hasUnsavedChanges = useAppSelector((state) =>
    sessionId
      ? selectMessageHasUnsavedChanges(state, sessionId, message.id)
      : false,
  );
  const hasHistory = useAppSelector((state) =>
    sessionId ? selectMessageHasHistory(state, sessionId, message.id) : false,
  );

  const { captureRef, isCapturing, captureAsPDF } = useDomCapturePrint();
  const handleFullPrint = useCallback(() => {
    captureAsPDF({ filename: `ai-response-${message.id}` });
  }, [captureAsPDF, message.id]);

  useEffect(() => {
    const t = setTimeout(() => setIsAppearing(false), 50);
    return () => clearTimeout(t);
  }, []);

  const handleQuickSave = async () => {
    if (!sessionId || isSaving) return;
    setIsSaving(true);
    try {
      const contentBlocks = buildContentBlocksForSave(
        message.content,
        message.rawContent as unknown[] | undefined,
      );
      await dispatch(
        editMessage({
          sessionId,
          messageId: message.id,
          newContent: contentBlocks,
        }),
      ).unwrap();
    } catch {
      /* toast handled by thunk */
    } finally {
      setIsSaving(false);
    }
  };

  const handleInlineContentChange = (messageId: string, newContent: string) => {
    if (sessionId) {
      dispatch(
        chatConversationsActions.updateMessage({
          sessionId,
          messageId,
          updates: { content: newContent },
        }),
      );
    }
    onContentChange?.(messageId, newContent);
  };

  const audioUrl = (message as ConversationMessage & { audioUrl?: string })
    .audioUrl;
  const audioMimeType = (
    message as ConversationMessage & { audioMimeType?: string }
  ).audioMimeType;
  // A TTS audio response is one of our own files — never let an expired
  // signature kill playback; the primitive re-mints from the recovered file_id.
  const { src: audioSrc, onError: handleAudioError } =
    useRemintableSrc(audioUrl);

  const handleDownloadAudio = async () => {
    if (!audioUrl || isDownloading) return;
    setIsDownloading(true);
    try {
      const resp = await fetch(audioUrl);
      const blob = await resp.blob();
      const objectUrl = URL.createObjectURL(blob);
      const ext = audioMimeType?.split("/")[1] ?? "wav";
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = `audio-response.${ext}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(objectUrl);
    } catch {
      /* silent */
    } finally {
      setIsDownloading(false);
    }
  };

  const isError = message.status === "error";
  const isAudioResponse = !!audioUrl;
  const showLoading =
    message.status === "pending" ||
    (message.status === "streaming" &&
      !message.content &&
      !message.streamEvents?.length);

  const markdownClassName = compact ? "text-xs bg-transparent" : "bg-textured";
  const buttonMargin = compact ? "mt-0.5" : "mt-1";

  return (
    <div
      className={`flex min-w-0 overflow-x-hidden ${isAppearing ? "opacity-0" : "opacity-100"} transition-opacity duration-300`}
    >
      <div className="max-w-full min-w-0 w-full relative overflow-x-hidden">
        {showLoading && (
          <div className="flex items-center gap-2 text-muted-foreground">
            <div className="flex gap-1">
              <span
                className="w-1.5 h-1.5 bg-primary/50 rounded-full animate-bounce"
                style={{ animationDelay: "0ms" }}
              />
              <span
                className="w-1.5 h-1.5 bg-primary/50 rounded-full animate-bounce"
                style={{ animationDelay: "150ms" }}
              />
              <span
                className="w-1.5 h-1.5 bg-primary/50 rounded-full animate-bounce"
                style={{ animationDelay: "300ms" }}
              />
            </div>
            <span className="text-sm text-muted-foreground/80">
              Planning...
            </span>
          </div>
        )}

        {!showLoading && isError && (
          <div className="flex items-start gap-2 p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
            <div className="text-sm text-destructive">
              {message.content || "An error occurred"}
            </div>
          </div>
        )}

        {!showLoading && !isError && isAudioResponse && (
          <div className="rounded-lg border bg-card p-3 space-y-2">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Volume2 className="w-4 h-4 text-primary flex-shrink-0" />
              <span className="font-medium text-foreground">
                Audio Response
              </span>
              {audioMimeType && (
                <span className="text-xs font-mono px-1.5 py-0.5 rounded bg-muted">
                  {audioMimeType}
                </span>
              )}
            </div>
            <audio
              controls
              autoPlay
              src={audioSrc}
              onError={handleAudioError}
              className="w-full"
            />
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleDownloadAudio}
                disabled={isDownloading}
                className="h-6 gap-1 px-2 text-xs text-primary hover:text-primary"
              >
                {isDownloading ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <Download className="w-3 h-3" />
                )}
                {isDownloading ? "Downloading\u2026" : "Download audio"}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={async () => {
                  if (!audioUrl) return;
                  await navigator.clipboard.writeText(audioUrl).catch(() => {});
                  setIsAudioLinkCopied(true);
                  setTimeout(() => setIsAudioLinkCopied(false), 2000);
                }}
                className="h-6 gap-1 px-2 text-xs text-muted-foreground hover:text-foreground"
                title="Copy audio link"
              >
                {isAudioLinkCopied ? (
                  <Check className="w-3 h-3" />
                ) : (
                  <LinkIcon className="w-3 h-3" />
                )}
                {isAudioLinkCopied ? "Copied!" : "Copy link"}
              </Button>
            </div>
          </div>
        )}

        {!showLoading &&
          !isError &&
          !isAudioResponse &&
          isStreamActive &&
          !message.content &&
          isTtsRequest && <AudioOutputBlockSkeleton />}

        {!showLoading &&
          !isError &&
          !isAudioResponse &&
          !(isStreamActive && !message.content && isTtsRequest) && (
            <>
              <div ref={captureRef}>
                <MarkdownStream
                  content={message.content}
                  events={message.streamEvents}
                  isStreamActive={
                    isStreamActive && message.status === "streaming"
                  }
                  hideCopyButton={true}
                  allowFullScreenEditor={false}
                  className={markdownClassName}
                  onContentChange={(newContent) =>
                    handleInlineContentChange(message.id, newContent)
                  }
                />
              </div>

              {!isStreamActive && !isOverlay && message.content && (
                <div className={buttonMargin}>
                  <AssistantActionBar
                    content={message.content}
                    messageId={message.id}
                    sessionId={sessionId}
                    hasUnsavedChanges={hasUnsavedChanges}
                    hasHistory={hasHistory}
                    isSaving={isSaving}
                    rawContent={message.rawContent as unknown[]}
                    onQuickSave={handleQuickSave}
                    onFullPrint={handleFullPrint}
                    isCapturing={isCapturing}
                  />
                </div>
              )}
            </>
          )}
      </div>
    </div>
  );
}

export default AssistantMessage;
