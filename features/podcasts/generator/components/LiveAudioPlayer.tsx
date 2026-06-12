"use client";

// features/podcasts/generator/components/LiveAudioPlayer.tsx
//
// Listen-while-it-renders player for the studio run page. Binds a
// StreamingPcmPlayer (fed by `audio_stream_chunk` events in useStudioRun) to a
// compact transport: play/pause, live position over the buffered duration, and
// seek within what has rendered so far. The buffered edge keeps growing as the
// TTS streams; when the canonical file lands the parent swaps this for the
// full PodcastAudioPlayer, carrying the position over.

import { useEffect, useReducer } from "react";
import { Pause, Play } from "lucide-react";
import { cn } from "@/lib/utils";
import type { StreamingPcmPlayer } from "@/features/audio/streamingPcmPlayer";

interface LiveAudioPlayerProps {
  player: StreamingPcmPlayer;
  title?: string;
}

function formatTime(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function LiveAudioPlayer({ player, title }: LiveAudioPlayerProps) {
  // The player mutates outside React; onUpdate drives cheap re-renders.
  const [, forceUpdate] = useReducer((n: number) => n + 1, 0);
  useEffect(() => player.onUpdate(forceUpdate), [player]);

  const positionMs = player.getPositionMs();
  const bufferedMs = player.getBufferedMs();
  const playing = player.isPlaying();
  const progress = bufferedMs > 0 ? (positionMs / bufferedMs) * 100 : 0;

  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-primary">
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary/60" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-primary" />
          </span>
          Listen live
        </span>
        <span className="text-xs text-muted-foreground">
          You&apos;re hearing the audio as it&apos;s rendered
        </span>
      </div>

      {title && (
        <p className="mb-3 truncate text-sm font-semibold text-foreground">
          {title}
        </p>
      )}

      <div className="flex items-center gap-4">
        <button
          onClick={() => (playing ? player.pause() : player.play())}
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-colors hover:bg-primary/90 active:scale-95"
          aria-label={playing ? "Pause" : "Play"}
        >
          {playing ? (
            <Pause className="h-5 w-5" />
          ) : (
            <Play className="ml-0.5 h-5 w-5" />
          )}
        </button>

        <div className="min-w-0 flex-1">
          {/* Progress over the buffered range. The right edge keeps growing as
              chunks land — seeking is allowed anywhere inside it. */}
          <div
            className="relative h-2 w-full cursor-pointer overflow-hidden rounded-full bg-muted"
            onClick={(e) => {
              if (!bufferedMs) return;
              const rect = e.currentTarget.getBoundingClientRect();
              const ratio = (e.clientX - rect.left) / rect.width;
              player.seekMs(ratio * bufferedMs);
            }}
            role="progressbar"
            aria-valuenow={Math.round(progress)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Live audio position"
          >
            <div
              className={cn(
                "absolute inset-y-0 left-0 rounded-full bg-primary transition-[width] duration-200",
              )}
              style={{ width: `${progress}%` }}
            />
            {/* Soft pulse at the buffered edge while the stream is open. */}
            {!player.hasEnded() && (
              <div className="absolute inset-y-0 right-0 w-4 animate-pulse rounded-r-full bg-primary/20" />
            )}
          </div>
          <div className="mt-1.5 flex justify-between text-xs tabular-nums text-muted-foreground">
            <span>{formatTime(positionMs)}</span>
            <span>
              {formatTime(bufferedMs)}
              {!player.hasEnded() && (
                <span className="ml-1 text-muted-foreground/60">rendered</span>
              )}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
