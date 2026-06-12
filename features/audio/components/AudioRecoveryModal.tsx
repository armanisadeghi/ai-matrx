/**
 * Audio Recovery Modal
 *
 * Shows recovered audio recordings from a previous session with playback
 * (via AudioOutputBlock) and actionable options: save to notes, open in chat,
 * copy text, re-transcribe, or dismiss.
 */

"use client";

import React, { useState, useEffect } from "react";
import {
  Mic,
  Copy,
  Check,
  Trash2,
  RotateCcw,
  Loader2,
  BookOpen,
  MessageSquarePlus,
  AlertCircle,
  Bug,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAppDispatch } from "@/lib/redux/hooks";
import { openOverlay } from "@/lib/redux/slices/overlaySlice";
import AudioOutputBlock from "@/components/mardown-display/blocks/audio/AudioOutputBlock";
import { useAudioRecovery } from "../providers/AudioRecoveryProvider";
import { SafetyRecord } from "../services/audioSafetyStore";
import { uploadAndTranscribeFull } from "../services/audioFallbackUpload";

// ─── Utilities ────────────────────────────────────────────────────────────────

function formatTimestamp(ts: number): string {
  return new Date(ts).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatDuration(chunks: ArrayBuffer[], bytesPerSecond = 16000): string {
  const totalBytes = chunks.reduce((sum, c) => sum + c.byteLength, 0);
  const seconds = Math.round(totalBytes / bytesPerSecond);
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `~${m}:${String(s).padStart(2, "0")}`;
}

// ─── Recovery Item ─────────────────────────────────────────────────────────────

interface RecoveryItemProps {
  item: SafetyRecord;
  onDismiss: (id: string) => void;
  onClose: () => void;
}

function RecoveryItem({ item, onDismiss, onClose }: RecoveryItemProps) {
  const { getAudioBlob } = useAudioRecovery();
  const dispatch = useAppDispatch();
  const router = useRouter();

  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [isRetranscribing, setIsRetranscribing] = useState(false);
  const [localText, setLocalText] = useState(item.accumulatedText);

  useEffect(() => {
    let url: string | null = null;
    (async () => {
      const blob = await getAudioBlob(item.id);
      if (blob) {
        url = URL.createObjectURL(blob);
        setAudioUrl(url);
      }
    })();
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [item.id, getAudioBlob]);

  const handleCopyText = async () => {
    if (!localText) return;
    await navigator.clipboard.writeText(localText);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
    toast.success("Text copied to clipboard");
  };

  const handleSaveToNotes = () => {
    if (!localText.trim()) {
      toast.error("No transcription text to save");
      return;
    }
    dispatch(
      openOverlay({
        overlayId: "saveToNotes",
        instanceId: crypto.randomUUID(),
        data: {
          initialContent: localText.trim(),
          defaultFolder: "Voice Notes",
          initialLabel: `Voice Note — ${formatTimestamp(item.createdAt)}`,
        },
      }),
    );
    onClose();
  };

  const handleOpenInChat = async () => {
    if (localText.trim()) {
      try {
        await navigator.clipboard.writeText(localText.trim());
        toast.success("Transcription copied — paste it into your conversation");
      } catch {
        toast.info("Navigate to chat and paste your transcription");
      }
    }
    onClose();
    router.push("/agents/all");
  };

  const handleRetranscribe = async () => {
    const blob = await getAudioBlob(item.id);
    if (!blob) return;
    setIsRetranscribing(true);
    try {
      const result = await uploadAndTranscribeFull(blob, "recovery");
      if (result.success && result.text) {
        setLocalText(result.text);
        toast.success("Transcription updated");
      } else {
        toast.error("Transcription failed");
      }
    } finally {
      setIsRetranscribing(false);
    }
  };

  const handleReportLoss = async (record: SafetyRecord) => {
    const report = [
      `[Audio Recovery Failure]`,
      `Recording ID: ${record.id}`,
      `Session ID: ${record.sessionId}`,
      `Status: ${record.status}`,
      `Created: ${formatTimestamp(record.createdAt)}`,
      `Audio chunks saved: ${record.audioChunks.length}`,
      `Text captured: ${record.accumulatedText ? `"${record.accumulatedText.slice(0, 120)}..."` : "none"}`,
      `MIME type: ${record.mimeType}`,
      `Error: ${record.errorMessage ?? "none"}`,
      ``,
      `The recording was saved to IndexedDB (status: ${record.status}) but the session ended before any audio chunks could be captured. The recovery modal correctly detected the orphaned entry but had nothing to play back or transcribe.`,
    ].join("\n");

    try {
      await navigator.clipboard.writeText(report);
      toast.success("Bug report copied — paste it into the description below");
    } catch {
      toast.info("Opening feedback form — please describe what happened");
    }
    dispatch(openOverlay({ overlayId: "feedbackDialog" }));
  };

  const hasAudio = item.audioChunks.length > 0;
  const hasText = localText.trim().length > 0;
  const isEmpty = !hasAudio && !hasText;

  return (
    <div className="border border-border rounded-lg p-3 space-y-3">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 flex-wrap">
          <Mic className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
          <span className="text-xs text-muted-foreground">
            {formatTimestamp(item.createdAt)}
          </span>
          {hasAudio && (
            <span className="text-xs text-muted-foreground">
              {formatDuration(item.audioChunks)}
            </span>
          )}
          <span
            className={cn(
              "text-[10px] px-1.5 py-0.5 rounded-full font-medium",
              item.status === "failed"
                ? "bg-destructive/10 text-destructive"
                : item.status === "recording"
                  ? "bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400"
                  : "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400",
            )}
          >
            {item.status}
          </span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onDismiss(item.id)}
          className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
          title="Delete this recording"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Empty state — recording was cut off before any data was captured */}
      {isEmpty && (
        <div className="rounded-md border border-destructive/20 bg-destructive/5 px-3 py-3 space-y-2.5">
          <div className="flex items-start gap-2">
            <AlertCircle className="h-4 w-4 text-destructive mt-0.5 flex-shrink-0" />
            <div className="space-y-1">
              <p className="text-xs font-medium text-foreground">
                We couldn&apos;t recover this recording
              </p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Your session ended before any audio reached the recovery store.
                We&apos;re sorry — this shouldn&apos;t happen, and we want to
                fix it.
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleReportLoss(item)}
            className="h-7 text-xs gap-1.5 border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
          >
            <Bug className="h-3 w-3" />
            Report Lost Recording
          </Button>
        </div>
      )}

      {/* Audio player — reuse the existing AudioOutputBlock */}
      {audioUrl && (
        <AudioOutputBlock
          url={audioUrl}
          mimeType={item.mimeType}
          title="Recovered Recording"
          artist={formatTimestamp(item.createdAt)}
          defaultMode="landscape"
        />
      )}

      {/* Transcription text */}
      {hasText && (
        <div className="bg-muted/50 rounded-md p-2 max-h-28 overflow-y-auto">
          <p className="text-xs text-foreground/80 leading-relaxed whitespace-pre-wrap">
            {localText}
          </p>
        </div>
      )}

      {/* Primary actions — only when there's text to act on */}
      {hasText && (
        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="default"
            size="sm"
            onClick={handleSaveToNotes}
            className="h-8 text-xs gap-1.5"
          >
            <BookOpen className="h-3.5 w-3.5" />
            Save to Notes
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={handleOpenInChat}
            className="h-8 text-xs gap-1.5"
          >
            <MessageSquarePlus className="h-3.5 w-3.5" />
            Open in Chat
          </Button>
        </div>
      )}

      {/* Secondary actions */}
      {(hasText || hasAudio) && (
        <div className="flex items-center gap-1.5 flex-wrap">
          {hasText && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleCopyText}
              className="h-7 text-xs gap-1.5"
            >
              {copied ? (
                <Check className="h-3 w-3" />
              ) : (
                <Copy className="h-3 w-3" />
              )}
              {copied ? "Copied" : "Copy Text"}
            </Button>
          )}
          {hasAudio && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleRetranscribe}
              disabled={isRetranscribing}
              className="h-7 text-xs gap-1.5"
            >
              {isRetranscribing ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <RotateCcw className="h-3 w-3" />
              )}
              Re-transcribe
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Modal ─────────────────────────────────────────────────────────────────────

export interface AudioRecoveryModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AudioRecoveryModal({
  isOpen,
  onClose,
}: AudioRecoveryModalProps) {
  const { recoveredItems, dismissItem, dismissAll, hasRecoveredData } =
    useAudioRecovery();

  const handleDismissItem = async (id: string) => {
    await dismissItem(id);
    if (recoveredItems.length <= 1) {
      onClose();
    }
  };

  const handleDismissAll = async () => {
    await dismissAll();
    onClose();
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-w-lg max-h-[80dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mic className="h-5 w-5" />
            Recovered Recordings
          </DialogTitle>
          <DialogDescription>
            These recordings were saved when your session ended unexpectedly.
            Play them back, save the transcription to Notes, or open in Chat.
          </DialogDescription>
        </DialogHeader>

        {hasRecoveredData ? (
          <div className="space-y-3">
            {recoveredItems.map((item) => (
              <RecoveryItem
                key={item.id}
                item={item}
                onDismiss={handleDismissItem}
                onClose={onClose}
              />
            ))}
            <div className="flex justify-end pt-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleDismissAll}
                className="text-xs text-muted-foreground"
              >
                Dismiss All
              </Button>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-6">
            No recovered recordings found.
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
