"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Volume2,
  Download,
  Link as LinkIcon,
  Loader2,
  Check,
  Save,
} from "lucide-react";
import { Button } from "@ai-matrx/design-system/controls";
import MarkdownStream from "@host/components/MarkdownStream";
import AudioOutputBlockSkeleton from "@host/components/mardown-display/blocks/audio/AudioOutputBlockSkeleton";
import { useDomCapturePrint } from "../conversation/hooks/useDomCapturePrint";
import { useAppSelector, useAppDispatch } from "../store/hooks";
import { selectMessageHasUnsavedChanges } from "./_legacy-stubs";
import { editMessage } from "./_legacy-stubs";
import { buildContentBlocksForSave } from "./utils/buildContentBlocksForSave";
import { useMediaLoadRecovery } from "@ai-matrx/media/core";
import { recognizeOurFileUrl } from "@host/lib/media/our-file-sources";
import { chatConversationsActions } from "./_legacy-stubs";
import { RichDocumentActions } from "@host/features/rich-document/RichDocumentActions";
import { MessageTimestamp } from "../agents/components/messages-display/MessageTimestamp";
import type { ConversationMessage } from "./_legacy-stubs";
import { ErrorAlchemyMenu } from "@ai-matrx/chat/host/ui-slots";

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
  // A TTS audio response is one of our own files — on a load failure the
  // primitive refreshes the file-session cookie and retries the durable URL.
  const {
    retryKey: audioRetryKey,
    onLoadError: handleAudioError,
    healedSrc: healedAudioSrc,
  } = useMediaLoadRecovery(audioUrl ?? null, {
    recoverable: !!audioUrl && recognizeOurFileUrl(audioUrl) !== null,
    // The ref the heal ladder heals BY (bearer byte fetch on our file id).
    failureRef: audioUrl ? { url: audioUrl } : null,
  });
  // A healed (bearer-lane) object URL replaces a dead element src.
  const audioSrc = healedAudioSrc ?? audioUrl ?? "";

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
      className={`group/assistant-msg flex min-w-0 overflow-x-hidden ${isAppearing ? "opacity-0" : "opacity-100"} transition-opacity duration-300`}
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
            <ErrorAlchemyMenu />
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
              key={audioRetryKey}
              controls
              autoPlay
              src={audioSrc}
              onError={handleAudioError}
              className="w-full"
            />
            <div className="flex items-center gap-2">
              <Button
                icon={isDownloading ? (
                  <Loader2 className="animate-spin" />
                ) : (
                  <Download />
                )}
                variant="quiet"
                onClick={handleDownloadAudio}
                disabled={isDownloading}
              >
                {isDownloading ? "Downloading\u2026" : "Download audio"}
              </Button>
              <Button
                icon={isAudioLinkCopied ? (
                  <Check />
                ) : (
                  <LinkIcon />
                )}
                variant="quiet"
                onClick={async () => {
                  if (!audioUrl) return;
                  await navigator.clipboard.writeText(audioUrl).catch(() => {});
                  setIsAudioLinkCopied(true);
                  setTimeout(() => setIsAudioLinkCopied(false), 2000);
                }}
                title="Copy audio link"
              >
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
                <MarkdownStream imagePolicy="ai"
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
                  {/* The ONE action registry — the same actions every
                      document gets (RC-B6). This legacy renderer has no
                      cx_message write-back wiring, so the content rides as a
                      raw source: write-back actions are absent, not dead; the
                      quick-save below is its own edit path. */}
                  <div className="flex items-center gap-2">
                    <RichDocumentActions
                      content={message.content}
                      source={{ type: "raw" }}
                      actions={{ callbacks: { onFullPrint: handleFullPrint } }}
                    />
                    {hasUnsavedChanges && (
                      <Button
                        icon={isSaving ? (
                          <Loader2 className="animate-spin" />
                        ) : (
                          <Save />
                        )}
                        variant="quiet"
                        onClick={handleQuickSave}
                        aria-label="Save changes"
                      >
                        Save
                      </Button>
                    )}
                    <MessageTimestamp
                      timestamp={message.createdAt ?? message.timestamp}
                    />
                  </div>
                </div>
              )}
            </>
          )}
      </div>
    </div>
  );
}

export default AssistantMessage;
