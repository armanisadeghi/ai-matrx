"use client";

/**
 * SessionAudioPlayer — the one transport surface for a scribe session's audio.
 *
 * Mounted ONCE per session at the ScribeScreen level (above all tabs) so it owns
 * the single `HTMLAudioElement` (via `useScribeSessionAudio`) and plays the
 * whole session on its unified seconds-from-start timeline — auto-advancing
 * across the per-recording audio files. Every other surface (recording cards,
 * agent `<audiocite>` citations) just fires `requestScribeAudioSeek`; this bar
 * is where playback, scrubbing, ±10s, and speed actually live.
 *
 * Appears only once playback is engaged (a card or citation seeks it, or the
 * user presses play), so it never stacks a second permanent bar on the capture
 * screen. Dismiss returns it to hidden.
 */

import { useEffect, useState } from "react";
import {
  Pause,
  Play,
  RotateCcw,
  RotateCw,
  X,
  Loader2,
  Gauge,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Slider } from "@/components/ui/slider";
import {
  useScribeSessionAudio,
  PLAYBACK_RATES,
} from "../../hooks/useScribeSessionAudio";

function formatClock(totalSec: number): string {
  const sec = Math.max(0, Math.floor(totalSec));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

interface SessionAudioPlayerProps {
  sessionId: string;
}

export function SessionAudioPlayer({ sessionId }: SessionAudioPlayerProps) {
  const audio = useScribeSessionAudio(sessionId);
  const [dismissed, setDismissed] = useState(false);

  // Any fresh playback (a card tap or an agent citation seeks + autoplays) wins
  // back the bar even if the user dismissed a previous clip.
  useEffect(() => {
    if (audio.isPlaying) setDismissed(false);
  }, [audio.isPlaying]);

  // Engaged = a segment is loaded or playback is running. Until then we stay out
  // of the way (the capture screen has its own bottom record bar).
  const engaged = audio.activeIndex >= 0 || audio.isPlaying;
  if (!audio.hasAudio || !engaged || dismissed) return null;

  const cycleRate = () => {
    const i = PLAYBACK_RATES.indexOf(audio.playbackRate);
    audio.setPlaybackRate(PLAYBACK_RATES[(i + 1) % PLAYBACK_RATES.length]!);
  };

  return (
    <div className="shrink-0 border-t border-border bg-card/95 px-3 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur">
      <div className="flex items-center gap-2">
        {/* Skip back 10s */}
        <button
          type="button"
          onClick={() => audio.skip(-10)}
          aria-label="Back 10 seconds"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-foreground active:bg-accent"
        >
          <RotateCcw className="h-4 w-4" />
        </button>

        {/* Play / pause */}
        <button
          type="button"
          onClick={audio.toggle}
          aria-label={audio.isPlaying ? "Pause" : "Play"}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground active:scale-95"
        >
          {audio.isLoading ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : audio.isPlaying ? (
            <Pause className="h-5 w-5" />
          ) : (
            <Play className="h-5 w-5" />
          )}
        </button>

        {/* Skip forward 10s */}
        <button
          type="button"
          onClick={() => audio.skip(10)}
          aria-label="Forward 10 seconds"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-foreground active:bg-accent"
        >
          <RotateCw className="h-4 w-4" />
        </button>

        {/* Scrubber + times */}
        <span className="ml-1 shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground">
          {formatClock(audio.currentTime)}
        </span>
        <Slider
          value={[Math.min(audio.currentTime, audio.duration)]}
          max={Math.max(audio.duration, 0.1)}
          step={0.5}
          onValueChange={(v) =>
            audio.seekTo(v[0]!, { autoplay: audio.isPlaying })
          }
          aria-label="Seek"
          className="min-w-0 flex-1"
        />
        <span className="shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground">
          {formatClock(audio.duration)}
        </span>

        {/* Playback speed */}
        <button
          type="button"
          onClick={cycleRate}
          aria-label={`Playback speed ${audio.playbackRate}x`}
          className={cn(
            "flex h-9 shrink-0 items-center gap-0.5 rounded-full px-2 text-xs font-medium text-foreground active:bg-accent",
            audio.playbackRate !== 1 && "text-primary",
          )}
        >
          <Gauge className="h-3.5 w-3.5" />
          {audio.playbackRate}x
        </button>

        {/* Dismiss */}
        <button
          type="button"
          onClick={() => {
            audio.stop();
            setDismissed(true);
          }}
          aria-label="Close player"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted-foreground active:bg-accent"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
