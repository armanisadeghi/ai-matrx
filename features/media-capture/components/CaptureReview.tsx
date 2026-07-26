"use client";

/**
 * features/media-capture/components/CaptureReview.tsx
 *
 * Review step of the Capture Studio, for all three artifact kinds:
 * - photo: the captured image (tracked object URL pre-save; after save the
 *   durable `<InlineMediaRef>` by file_id — proving the round-trip).
 * - video/audio: local `<video>`/`<audio>` playback of the recorded blob,
 *   routed through the user's chosen output device via `useOutputSinkRef`
 *   and joined to the unified audio system via
 *   `useMediaElementPlaybackSession` (playback lock + Audio panel row).
 *
 * The owning studio revokes the tracked object URL on retake/replace/unmount
 * (and on the photo save-swap). Partial recoveries are surfaced LOUDLY via
 * `partialNote` — a recovered recording is never presented as whole.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Check,
  Download,
  FileText,
  Loader2,
  RotateCcw,
  Save,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { InlineMediaRef } from "@/features/files/components/inline/InlineMediaRef";
import { useOutputSinkRef } from "@/features/audio/useOutputSinkRef";
import { useMediaElementPlaybackSession } from "@/features/audio/session/useMediaElementPlaybackSession";
import { transcribeCloudFile } from "@/features/audio/services/speechApi";
import { ContentActionBar } from "@/components/content-actions/ContentActionBar";
import { toast } from "@/lib/toast";

export interface CaptureReviewProps {
  /** Which artifact kind is under review. */
  kind: "photo" | "video" | "audio";
  /** Tracked object URL of the captured blob (pre-save). */
  previewUrl: string;
  fileName: string;
  saving: boolean;
  /** Set after a successful save — photos switch to InlineMediaRef;
   *  video/audio keep local playback with a "Saved" badge. */
  savedFileId: string | null;
  uploadError: string | null;
  /** LOUD partial-recovery / partial-recording note, when applicable. */
  partialNote?: string | null;
  /** Folder label for the saved badge (e.g. "Captures/Videos"). */
  savedFolderLabel: string;
  onRetake: () => void;
  onDownload: () => void;
  onSave: () => void;
}

export function CaptureReview({
  kind,
  previewUrl,
  fileName,
  saving,
  savedFileId,
  uploadError,
  partialNote,
  savedFolderLabel,
  onRetake,
  onDownload,
  onSave,
}: CaptureReviewProps) {
  const mediaRef = useRef<HTMLMediaElement | null>(null);
  const sinkRef = useOutputSinkRef(
    mediaRef as unknown as React.Ref<HTMLVideoElement | HTMLAudioElement>,
  );
  const [isPlaying, setIsPlaying] = useState(false);

  // ── Transcription (saved video/audio only — the server reads the file_id) ──
  //
  // The transcription state carries the file id it belongs to, so a new
  // capture simply stops matching and nothing is displayed. Deriving this
  // beats resetting it in an effect: there is no frame in which the previous
  // capture's transcript is shown under the new one, and a late response for
  // an old file can never be rendered.
  interface TranscriptionState {
    fileId: string;
    status: "loading" | "done" | "error";
    text: string;
    error: string;
  }
  const [transcription, setTranscription] = useState<TranscriptionState | null>(
    null,
  );
  const abortRef = useRef<AbortController | null>(null);

  const canTranscribe = kind !== "photo" && savedFileId !== null;
  const current =
    transcription && transcription.fileId === savedFileId ? transcription : null;
  const transcribing = current?.status === "loading";
  const transcript = current?.status === "done" ? current.text : null;
  const transcriptError = current?.status === "error" ? current.error : null;

  useEffect(() => () => abortRef.current?.abort(), []);

  const handleTranscribe = useCallback(async () => {
    if (!savedFileId || transcribing) return;
    const fileId = savedFileId;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setTranscription({ fileId, status: "loading", text: "", error: "" });
    try {
      const result = await transcribeCloudFile({ fileId }, controller.signal);
      if (controller.signal.aborted) return;
      const text = result.text.trim();
      setTranscription(
        text
          ? { fileId, status: "done", text, error: "" }
          : {
              fileId,
              status: "error",
              text: "",
              error:
                "No speech was detected in this recording — nothing to transcribe.",
            },
      );
    } catch (err) {
      if (controller.signal.aborted) return;
      console.error("[CaptureReview] transcription failed", err);
      const message =
        err instanceof Error ? err.message : "Transcription failed — try again.";
      setTranscription({ fileId, status: "error", text: "", error: message });
      toast.error(message);
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
    }
  }, [savedFileId, transcribing]);

  // Join the unified audio system while review playback runs (playback lock
  // + Audio panel visibility). Photos never register.
  useMediaElementPlaybackSession({
    elementRef: mediaRef,
    isPlaying: kind !== "photo" && isPlaying,
    source: "media-capture",
    label: `Review: ${fileName}`,
    trackKey: previewUrl,
  });

  return (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto">
      <div className="relative min-h-0 flex-1 overflow-hidden rounded-lg border border-border bg-muted/30">
        {kind === "photo" ? (
          savedFileId ? (
            <InlineMediaRef
              ref={savedFileId}
              size="fill"
              fit="contain"
              alt={fileName}
              rounded="none"
            />
          ) : (
            // Local ephemeral preview — object URL from the tracked registry.
            <img
              src={previewUrl}
              alt={fileName}
              className="h-full w-full object-contain"
            />
          )
        ) : kind === "video" ? (
          <video
            ref={sinkRef}
            src={previewUrl}
            controls
            playsInline
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
            onEnded={() => setIsPlaying(false)}
            className="h-full w-full object-contain"
            aria-label={fileName}
          />
        ) : (
          <div className="flex h-full items-center justify-center px-6">
            <audio
              ref={sinkRef}
              src={previewUrl}
              controls
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
              onEnded={() => setIsPlaying(false)}
              className="w-full max-w-md"
              aria-label={fileName}
            />
          </div>
        )}
        {savedFileId && (
          <span className="absolute left-2 top-2 flex items-center gap-1 rounded-md bg-card/90 px-2 py-0.5 text-[11px] font-medium text-foreground shadow-sm">
            <Check className="h-3 w-3 text-primary" />
            Saved to {savedFolderLabel}
          </span>
        )}
      </div>

      {partialNote && (
        <p className="mt-2 flex items-start gap-1.5 text-xs text-destructive">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {partialNote}
        </p>
      )}
      {uploadError && (
        <p className="mt-2 text-xs text-destructive">{uploadError}</p>
      )}

      <div className="mt-2 flex shrink-0 items-center gap-2 pb-safe">
        <Button
          variant="outline"
          size="sm"
          className="h-9"
          onClick={onRetake}
          disabled={saving}
        >
          <RotateCcw className="mr-1.5 h-4 w-4" />
          {savedFileId ? "New capture" : "Retake"}
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-9"
          onClick={onDownload}
          disabled={saving || (kind === "photo" && savedFileId !== null)}
        >
          <Download className="mr-1.5 h-4 w-4" />
          Download
        </Button>
        {canTranscribe && (
          <Button
            variant="outline"
            size="sm"
            className="h-9"
            onClick={() => void handleTranscribe()}
            disabled={transcribing}
          >
            {transcribing ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <FileText className="mr-1.5 h-4 w-4" />
            )}
            {transcribing
              ? "Transcribing…"
              : transcript
                ? "Transcribe again"
                : "Transcribe"}
          </Button>
        )}
        {!savedFileId && (
          <Button size="sm" className="ml-auto h-9" onClick={onSave} disabled={saving}>
            {saving ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-1.5 h-4 w-4" />
            )}
            {saving ? "Saving…" : "Save"}
          </Button>
        )}
      </div>

      {/* ── Transcript ────────────────────────────────────────────────────── */}
      {kind !== "photo" && (transcribing || transcript || transcriptError) && (
        <div className="mt-2 shrink-0 rounded-lg border border-border bg-card p-3">
          <div className="mb-2 flex items-center gap-2">
            <FileText className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs font-medium text-foreground">Transcript</span>
            {transcript && (
              <ContentActionBar
                content={transcript}
                title={`Transcript — ${fileName}`}
                metadata={{ file_id: savedFileId, source: "media-capture" }}
                instanceKey={`capture-transcript-${savedFileId ?? "pending"}`}
                className="ml-auto"
              />
            )}
          </div>

          {transcribing && (
            <div className="space-y-2" aria-live="polite">
              <div className="h-3 w-full animate-pulse rounded bg-muted" />
              <div className="h-3 w-11/12 animate-pulse rounded bg-muted" />
              <div className="h-3 w-8/12 animate-pulse rounded bg-muted" />
              <p className="pt-1 text-xs text-muted-foreground">
                Transcribing on the server — long recordings are split
                automatically. You can keep this page open.
              </p>
            </div>
          )}

          {!transcribing && transcriptError && (
            <div className="flex items-start gap-1.5">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" />
              <div className="min-w-0">
                <p className="text-xs text-destructive">{transcriptError}</p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-1.5 h-7 text-xs"
                  onClick={() => void handleTranscribe()}
                >
                  Try again
                </Button>
              </div>
            </div>
          )}

          {!transcribing && transcript && (
            <p className="max-h-56 overflow-y-auto whitespace-pre-wrap text-xs leading-relaxed text-foreground">
              {transcript}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
