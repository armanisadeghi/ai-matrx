"use client";
import React, { useState, useRef, useCallback } from "react";
import { Volume2, Download, Loader2, Link, Copy, Check } from "lucide-react";
import { useDomCapturePrint } from "@/features/chat/hooks/useDomCapturePrint";
import MarkdownStream from "@/components/MarkdownStream";
import AudioOutputBlockSkeleton from "@/components/mardown-display/blocks/audio/AudioOutputBlockSkeleton";
import { AssistantActionBar } from "@/features/agents/components/messages-display/assistant/AssistantActionBar";
import { PromptErrorMessage } from "../PromptErrorMessage";
import { Button } from "@/components/ui/button";

interface PromptAssistantMessageProps {
  content: string;
  taskId?: string;
  messageIndex: number;
  isStreamActive?: boolean;
  onContentChange?: (messageIndex: number, newContent: string) => void;
  metadata?: {
    timeToFirstToken?: number;
    totalTime?: number;
    tokens?: number;
  };
  audioUrl?: string;
  audioMimeType?: string;
  /** Whether this request is expected to produce audio (TTS model) */
  isTtsRequest?: boolean;
  /** Compact mode: minimal header, reduced spacing */
  compact?: boolean;
}

export function PromptAssistantMessage({
  content,
  taskId,
  messageIndex,
  isStreamActive = false,
  onContentChange,
  metadata,
  audioUrl,
  audioMimeType,
  isTtsRequest = false,
  compact = false,
}: PromptAssistantMessageProps) {
  const [isAudioLinkCopied, setIsAudioLinkCopied] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);

  // DOM-capture print (Tier 2 — captures all rendered blocks)
  const { captureRef, isCapturing, captureAsPDF } = useDomCapturePrint();
  const handleFullPrint = useCallback(() => {
    captureAsPDF({ filename: `ai-response-${messageIndex}` });
  }, [captureAsPDF, messageIndex]);

  const handleContentChange = (newContent: string) => {
    if (onContentChange) {
      onContentChange(messageIndex, newContent);
    }
  };

  const handleDownloadAudio = async () => {
    if (!audioUrl || isDownloading) return;
    setIsDownloading(true);
    try {
      const response = await fetch(audioUrl);
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const ext = audioMimeType?.split("/")[1] ?? "wav";
      const filename = `audio-response.${ext}`;
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(objectUrl);
    } catch {
      // silent — browser will fall back gracefully
    } finally {
      setIsDownloading(false);
    }
  };

  // Check if this is an error message
  const isError = content.startsWith("Error:");
  const isAudioResponse = !!audioUrl;

  // Adjust styling based on compact mode - keep ALL functionality
  const markdownClassName = compact ? "text-xs bg-transparent" : "bg-textured";

  return (
    <div>
      {isError ? (
        <PromptErrorMessage message={content.replace("Error: ", "")} />
      ) : isAudioResponse ? (
        <div className="rounded-lg border bg-card p-3 space-y-2">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Volume2 className="w-4 h-4 text-primary flex-shrink-0" />
            <span className="font-medium text-foreground">Audio Response</span>
            {audioMimeType && (
              <span className="text-xs font-mono px-1.5 py-0.5 rounded bg-muted">
                {audioMimeType}
              </span>
            )}
          </div>
          <audio controls autoPlay src={audioUrl} className="w-full" />
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
              {isDownloading ? "Downloading…" : "Download audio"}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={async () => {
                if (!audioUrl) return;
                try {
                  await navigator.clipboard.writeText(audioUrl);
                  setIsAudioLinkCopied(true);
                  setTimeout(() => setIsAudioLinkCopied(false), 2000);
                } catch {
                  // silent
                }
              }}
              className="h-6 gap-1 px-2 text-xs text-muted-foreground hover:text-foreground"
              title="Copy audio link"
            >
              {isAudioLinkCopied ? (
                <Check className="w-3 h-3" />
              ) : (
                <Link className="w-3 h-3" />
              )}
              {isAudioLinkCopied ? "Copied!" : "Copy link"}
            </Button>
          </div>
        </div>
      ) : (
        <>
          {isStreamActive && !content && isTtsRequest ? (
            <AudioOutputBlockSkeleton />
          ) : (
            <div ref={captureRef}>
              <MarkdownStream
                content={content}
                taskId={taskId}
                isStreamActive={isStreamActive}
                hideCopyButton={true}
                allowFullScreenEditor={false}
                className={markdownClassName}
                onContentChange={handleContentChange}
              />
            </div>
          )}
          {!isStreamActive && (
            <AssistantActionBar
              messageId={`prompt-${taskId ?? messageIndex}`}
              conversationId=""
              onFullPrint={handleFullPrint}
              isCapturing={isCapturing}
            />
          )}
        </>
      )}
    </div>
  );
}
