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
import { cn } from "@/lib/utils";
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
  return (
    <div
      className={cn(
        "flex h-full w-full items-center justify-center bg-black",
        className,
      )}
    >
      <video
        ref={elementRef}
        controls
        src={url}
        className="max-h-full max-w-full"
        preload="metadata"
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={() => setIsPlaying(false)}
      >
        <source src={url} type={mimeType ?? undefined} />
      </video>
    </div>
  );
}

export default VideoPreview;
