/**
 * features/files/components/core/FilePreview/previewers/VideoPreview.tsx
 *
 * Joined to the unified media system (2026-07-26): while playing, the video
 * registers a session in the audioSessionRegistry (visible + controllable in
 * the avatar-menu Media panel) and claims the one-live-playback lock, so it
 * stops — and is stopped by — TTS/read-aloud and every other media path.
 */

"use client";

import { useRef, useState } from "react";
import { AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useMediaLoadRecovery } from "@ai-matrx/media/core";
import { recognizeOurFileUrl } from "@/lib/media/our-file-sources";
import { useMediaElementPlaybackSession } from "@/features/audio/session/useMediaElementPlaybackSession";

export interface VideoPreviewProps {
  url: string | null;
  mimeType: string | null;
  /** Human name for the Media panel row (file name). */
  label?: string;
  className?: string;
}

export function VideoPreview({
  url,
  mimeType,
  label,
  className,
}: VideoPreviewProps) {
  const elementRef = useRef<HTMLVideoElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  useMediaElementPlaybackSession({
    elementRef,
    isPlaying,
    source: "file-media",
    label: label || "Video preview",
    trackKey: url ?? undefined,
  });
  // Media durability: an owned durable URL that fails to load gets the
  // client's ONE retry contract (session refresh → same-URL retry once →
  // terminal). Foreign URLs fail straight.
  const { retryKey, onLoadError, failed } = useMediaLoadRecovery(url, {
    recoverable: !!url && recognizeOurFileUrl(url) !== null,
  });
  if (!url) {
    return (
      <div
        className={cn(
          "flex h-full w-full items-center justify-center bg-black",
          className,
        )}
      >
        <div className="h-10 w-10 animate-pulse rounded bg-muted" />
      </div>
    );
  }
  if (failed) {
    return (
      <div
        className={cn(
          "flex h-full w-full flex-col items-center justify-center gap-2 bg-black text-muted-foreground",
          className,
        )}
      >
        <AlertCircle className="h-6 w-6" />
        <span className="text-xs">This video failed to load.</span>
      </div>
    );
  }
  return (
    <div
      className={cn(
        "flex h-full w-full items-center justify-center bg-black",
        className,
      )}
    >
      <video
        key={retryKey}
        ref={elementRef}
        controls
        src={url}
        className="max-h-full max-w-full"
        preload="metadata"
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={() => setIsPlaying(false)}
        onError={onLoadError}
      >
        <source src={url} type={mimeType ?? undefined} />
      </video>
    </div>
  );
}

export default VideoPreview;
