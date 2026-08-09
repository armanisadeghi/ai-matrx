/**
 * SessionMediaElement — a drop-in `<audio>`/`<video>` that joins the unified
 * media system.
 *
 * Raw media elements play "in the dark": invisible to the avatar-menu Media
 * panel and outside the one-live-playback lock, so they talk over TTS and
 * every other media path. This component owns the ref + play-state wiring for
 * `useMediaElementPlaybackSession` (the same wiring VideoPreview does by hand),
 * so any surface — including elements rendered inside `.map()` loops, where a
 * hook per element is impossible — joins the system with one tag swap:
 *
 *   <video controls src={url} />
 *     → <SessionMediaElement controls src={url}
 *         sessionSource="research" sessionLabel={name} />
 *
 * NOTE: for OUR OWN stored media (a file_id / signed URL), render
 * `<InlineMediaRef>` instead — it self-heals expired URLs AND registers a
 * session. This component is for media the durability layer doesn't own
 * (external URLs, public CDN assets).
 */

"use client";

import { useRef, useState, type ComponentPropsWithoutRef } from "react";
import { useMediaElementPlaybackSession } from "./useMediaElementPlaybackSession";
import type { AudioSessionSource } from "./types";

export interface SessionMediaElementProps
  extends ComponentPropsWithoutRef<"video"> {
  /** Which tag to render. Defaults to "video". */
  as?: "audio" | "video";
  /** Attribution for the Media panel row (see AudioSessionSource). */
  sessionSource: AudioSessionSource;
  /** Human name for the Media panel row. */
  sessionLabel: string;
  /** A new value ends the session and starts fresh. Defaults to `src`. */
  trackKey?: string;
}

export function SessionMediaElement({
  as = "video",
  sessionSource,
  sessionLabel,
  trackKey,
  onPlay,
  onPause,
  onEnded,
  ...mediaProps
}: SessionMediaElementProps) {
  const elementRef = useRef<HTMLMediaElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  useMediaElementPlaybackSession({
    elementRef,
    isPlaying,
    source: sessionSource,
    label: sessionLabel,
    trackKey:
      trackKey ??
      (typeof mediaProps.src === "string" ? mediaProps.src : undefined),
  });

  const sessionHandlers = {
    onPlay: (e: React.SyntheticEvent<HTMLVideoElement>) => {
      setIsPlaying(true);
      onPlay?.(e);
    },
    onPause: (e: React.SyntheticEvent<HTMLVideoElement>) => {
      setIsPlaying(false);
      onPause?.(e);
    },
    onEnded: (e: React.SyntheticEvent<HTMLVideoElement>) => {
      setIsPlaying(false);
      onEnded?.(e);
    },
  };

  if (as === "audio") {
    return (
      <audio
        ref={(el) => {
          elementRef.current = el;
        }}
        {...mediaProps}
        {...sessionHandlers}
      />
    );
  }
  return (
    <video
      ref={(el) => {
        elementRef.current = el;
      }}
      {...mediaProps}
      {...sessionHandlers}
    />
  );
}

export default SessionMediaElement;
