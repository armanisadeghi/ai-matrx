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

import { useRef, useState } from "react";
import { AlertTriangle, Check, Download, Loader2, RotateCcw, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { InlineMediaRef } from "@/features/files";
import { useOutputSinkRef } from "@/features/audio/useOutputSinkRef";
import { useMediaElementPlaybackSession } from "@/features/audio/session/useMediaElementPlaybackSession";

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
    <div className="flex h-full min-h-0 flex-col">
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
    </div>
  );
}
