"use client";

import React, { useRef, useState, useEffect, useCallback } from "react";
import {
  Pause,
  Play,
  Volume2,
  VolumeX,
  RotateCcw,
  RotateCw,
  Repeat,
  RefreshCw,
  Music,
  Check,
} from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { InlineMediaRef } from "@/features/files";

interface PodcastAudioPlayerProps {
  audioUrl: string;
  title?: string;
  coverImageUrl?: string;
  onError?: () => void;
  /** Use white/light text for dark backgrounds (video mode) */
  dark?: boolean;
}

// Standard variant of HTMLMediaElement extended with the older vendor-prefixed
// preservesPitch properties — Safari < 15 and Firefox < 105 used these. Modern
// browsers (2023+) all use the unprefixed standard `preservesPitch`.
type AudioWithLegacyPitch = HTMLAudioElement & {
  webkitPreservesPitch?: boolean;
  mozPreservesPitch?: boolean;
};

const SKIP_SECONDS = 15;
const SPEED_OPTIONS = [1, 1.25, 1.5, 2, 3] as const;

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function formatSpeed(speed: number): string {
  // Use real multiplication sign (×) — matches YouTube/Spotify/Apple Podcasts.
  return `${speed}×`;
}

/**
 * Skip-by-15s icon: rotation arrow with the number "15" overlaid in the center.
 * This is the universal podcast UX (Apple Podcasts, Spotify, Pocket Casts) — it
 * immediately communicates "jump 15 seconds" rather than "skip track". Color is
 * inherited from the parent button via currentColor.
 */
function SkipFifteenIcon({ direction }: { direction: "back" | "forward" }) {
  const Icon = direction === "back" ? RotateCcw : RotateCw;
  return (
    <span
      className="relative inline-flex h-6 w-6 items-center justify-center"
      aria-hidden
    >
      <Icon className="h-6 w-6" strokeWidth={1.75} />
      <span className="absolute text-[8.5px] font-bold leading-none tracking-tighter translate-y-[1px]">
        15
      </span>
    </span>
  );
}

export function PodcastAudioPlayer({
  audioUrl,
  title,
  coverImageUrl,
  onError,
  dark = false,
}: PodcastAudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [isLooping, setIsLooping] = useState(false);
  // Fixed waveform pattern — must not use Math.random() here because this component
  // is rendered on the server (SSR) and client, and random values would differ,
  // causing a hydration mismatch. This pseudo-random pattern is deterministic.
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [speedOpen, setSpeedOpen] = useState(false);
  const [waveformData] = useState<number[]>(() => {
    const bars = 80;
    // Deterministic sine-wave-based pattern that looks like a real waveform
    return Array.from({ length: bars }, (_, i) => {
      const t = i / bars;
      // Mix of two sine waves at different frequencies for a natural look
      const v =
        0.5 +
        0.35 * Math.sin(t * Math.PI * 7 + 1.2) +
        0.15 * Math.sin(t * Math.PI * 19 + 0.5);
      return Math.max(0.1, Math.min(1, v));
    });
  });
  const [audioError, setAudioError] = useState(false);

  const progressPercentage = duration > 0 ? (currentTime / duration) * 100 : 0;

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) {
      audio.pause();
    } else {
      audio.play().catch(() => setAudioError(true));
    }
    setIsPlaying((p) => !p);
  }, [isPlaying]);

  const handleSeek = useCallback((value: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = value;
    setCurrentTime(value);
  }, []);

  const handleVolumeChange = useCallback(
    (value: number) => {
      const audio = audioRef.current;
      if (!audio) return;
      audio.volume = value;
      setVolume(value);
      if (value > 0 && isMuted) {
        audio.muted = false;
        setIsMuted(false);
      }
    },
    [isMuted],
  );

  const toggleMute = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.muted = !isMuted;
    setIsMuted((m) => !m);
  }, [isMuted]);

  const toggleLoop = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.loop = !isLooping;
    setIsLooping((l) => !l);
  }, [isLooping]);

  const skipForward = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const t = Math.min(audio.currentTime + SKIP_SECONDS, duration);
    audio.currentTime = t;
    setCurrentTime(t);
  }, [duration]);

  const skipBackward = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const t = Math.max(audio.currentTime - SKIP_SECONDS, 0);
    audio.currentTime = t;
    setCurrentTime(t);
  }, []);

  const handleSpeedChange = useCallback((speed: number) => {
    setPlaybackSpeed(speed);
    setSpeedOpen(false);
  }, []);

  const restart = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = 0;
    setCurrentTime(0);
    if (!isPlaying) {
      audio.play().catch(() => setAudioError(true));
      setIsPlaying(true);
    }
  }, [isPlaying]);

  useEffect(() => {
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    setAudioError(false);
  }, [audioUrl]);

  // Apply playback speed AND preserve pitch — this is the YouTube/Spotify
  // technique that keeps voices natural-sounding at higher speeds (no chipmunk
  // effect). `preservesPitch` is standard in modern browsers (defaults to true)
  // but we set it explicitly along with the older vendor-prefixed names for
  // Safari < 15 and Firefox < 105. Re-runs when `audioUrl` changes because a
  // fresh source resets playbackRate to 1.
  useEffect(() => {
    const audio = audioRef.current as AudioWithLegacyPitch | null;
    if (!audio) return;
    audio.playbackRate = playbackSpeed;
    audio.preservesPitch = true;
    audio.webkitPreservesPitch = true;
    audio.mozPreservesPitch = true;
  }, [playbackSpeed, audioUrl]);

  // Keyboard shortcuts (←/→ for ±15s) are only active while THIS player is
  // playing. That way pages with multiple players (e.g. WhatsApp chat bubbles)
  // never have arrows hijack a non-active instance, and inputs aren't affected
  // because we bail when focus is in a form field.
  useEffect(() => {
    if (!isPlaying) return;

    const handleKey = (e: KeyboardEvent) => {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        target?.isContentEditable
      ) {
        return;
      }
      e.preventDefault();
      if (e.key === "ArrowLeft") skipBackward();
      else skipForward();
    };

    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [isPlaying, skipBackward, skipForward]);

  if (audioError) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-10 text-muted-foreground">
        <Music className="h-10 w-10 opacity-40" />
        <p className="text-sm">Unable to load audio.</p>
      </div>
    );
  }

  const txt = dark ? "text-white/90" : "text-foreground";
  const txtMuted = dark ? "text-white/50" : "text-muted-foreground";
  const iconBtn = dark
    ? "p-2 rounded-full text-white/50 hover:text-white transition-colors"
    : "p-2 rounded-full text-muted-foreground hover:text-foreground transition-colors";
  const skipBtn = dark
    ? "p-2 rounded-full text-white/90 hover:bg-white/10 transition-colors"
    : "p-2 rounded-full text-foreground hover:bg-muted transition-colors";
  const waveformBg = dark ? "bg-white/10" : "bg-muted";
  const waveformFill = dark ? "bg-primary/20" : "bg-primary/15";
  // In dark mode the player sits on a near-black surface where the shared
  // Slider's `bg-primary/20` track and `bg-background` thumb nearly vanish —
  // override the track/thumb so the rail stays visible against black.
  const darkSlider = dark
    ? "[&>span:first-of-type]:bg-white/25 [&_[role=slider]]:bg-white [&_[role=slider]]:border-white/40"
    : "";

  return (
    <div className="w-full flex flex-col gap-4">
      {/*
        Headless <audio> driven by this component's custom transport (imperative
        audioRef + timeupdate/loadedmetadata/ended events, seek, speed, loop).
        InlineMediaRef is a *display* element (it renders its own controls) and
        deliberately doesn't model a headless player, so this is the one justified
        raw media element here. Durability is guaranteed upstream: audio_url is
        registered with the public-media-URL guard (pc_episodes/pc_studio_runs)
        and persisted public — it is never a raw signed S3 link.
      */}
      <audio
        ref={audioRef}
        src={audioUrl}
        onTimeUpdate={() => setCurrentTime(audioRef.current?.currentTime ?? 0)}
        onLoadedMetadata={() => setDuration(audioRef.current?.duration ?? 0)}
        onEnded={() => setIsPlaying(false)}
        onError={() => {
          setAudioError(true);
          onError?.();
        }}
        loop={isLooping}
        preload="metadata"
      />

      {/* Cover art or default icon */}
      <div className="flex items-center gap-4">
        <InlineMediaRef
          ref={coverImageUrl ?? null}
          size={{ width: 64, height: 64 }}
          fit="cover"
          rounded="lg"
          fallbackIcon={
            <Music
              className={`h-8 w-8 ${dark ? "text-white/40" : "text-primary"}`}
            />
          }
          className={`shrink-0 shadow-md ${dark ? "bg-white/10" : "bg-primary/10"}`}
          alt={title ?? "Podcast cover"}
        />
        <div className="min-w-0">
          {title && (
            <p className={`font-semibold truncate leading-tight ${txt}`}>
              {title}
            </p>
          )}
          <p className={`text-sm mt-0.5 ${txtMuted}`}>
            {duration > 0 ? formatTime(duration) : "--:--"}
          </p>
        </div>
      </div>

      {/* Waveform / progress visualization */}
      <div
        className={`relative h-12 w-full rounded-lg overflow-hidden ${waveformBg} cursor-pointer`}
        onClick={(e) => {
          if (!duration) return;
          const rect = e.currentTarget.getBoundingClientRect();
          const ratio = (e.clientX - rect.left) / rect.width;
          handleSeek(ratio * duration);
        }}
        role="progressbar"
        aria-valuenow={progressPercentage}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className={`absolute inset-y-0 left-0 ${waveformFill} transition-[width] duration-150`}
          style={{ width: `${progressPercentage}%` }}
        />
        <div className="absolute inset-0 flex items-end px-1 gap-px">
          {waveformData.map((h, i) => (
            <div
              key={i}
              className="flex-1 rounded-sm transition-colors duration-150"
              style={{
                height: `${h * 100}%`,
                backgroundColor:
                  (i / waveformData.length) * 100 < progressPercentage
                    ? "hsl(var(--primary))"
                    : dark
                      ? "rgba(255,255,255,0.2)"
                      : "hsl(var(--muted-foreground) / 0.3)",
              }}
            />
          ))}
        </div>
      </div>

      {/* Time labels */}
      <div className={`flex justify-between text-xs -mt-2 px-0.5 ${txtMuted}`}>
        <span>{formatTime(currentTime)}</span>
        <span>{duration > 0 ? formatTime(duration) : "--:--"}</span>
      </div>

      {/* Seek slider */}
      <Slider
        value={[currentTime]}
        min={0}
        max={duration || 100}
        step={0.5}
        onValueChange={([v]) => handleSeek(v)}
        className={cn("h-1", darkSlider)}
        aria-label="Seek"
      />

      {/* Controls row — 3-column grid with `auto` center column and `1fr` outer
          columns guarantees the play button is geometrically centered regardless
          of how wide each side cluster is (e.g. when the volume slider is
          hidden on mobile). */}
      <div className="grid grid-cols-[1fr_auto_1fr] items-center">
        {/* Left: restart + speed */}
        <div className="flex items-center gap-1 justify-self-start">
          <button onClick={restart} className={iconBtn} aria-label="Restart">
            <RefreshCw className="h-4 w-4" />
          </button>
          <Popover open={speedOpen} onOpenChange={setSpeedOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                aria-label={`Playback speed: ${formatSpeed(playbackSpeed)}`}
                title={`Playback speed (${formatSpeed(playbackSpeed)})`}
                className={`h-8 min-w-[2.25rem] px-2 rounded-full text-xs font-semibold tabular-nums transition-colors ${
                  playbackSpeed !== 1
                    ? dark
                      ? "bg-white/15 text-white"
                      : "bg-primary/10 text-primary"
                    : dark
                      ? "text-white/70 hover:text-white hover:bg-white/10"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted"
                }`}
              >
                {formatSpeed(playbackSpeed)}
              </button>
            </PopoverTrigger>
            <PopoverContent
              align="start"
              side="top"
              sideOffset={8}
              className="w-32 p-1"
            >
              <div
                role="menu"
                aria-label="Playback speed"
                className="flex flex-col"
              >
                {SPEED_OPTIONS.map((s) => {
                  const active = s === playbackSpeed;
                  return (
                    <button
                      key={s}
                      role="menuitemradio"
                      aria-checked={active}
                      onClick={() => handleSpeedChange(s)}
                      className={`flex items-center justify-between px-2.5 py-1.5 rounded-sm text-sm font-medium tabular-nums transition-colors ${
                        active
                          ? "bg-accent text-accent-foreground"
                          : "text-foreground hover:bg-accent/60"
                      }`}
                    >
                      <span>{formatSpeed(s)}</span>
                      {active && <Check className="h-3.5 w-3.5 text-primary" />}
                    </button>
                  );
                })}
              </div>
            </PopoverContent>
          </Popover>
        </div>

        {/* Center: skip back 15s / play / skip forward 15s */}
        <div className="flex items-center gap-3 justify-self-center">
          <button
            onClick={skipBackward}
            className={skipBtn}
            aria-label="Back 15 seconds"
            title="Back 15 seconds (←)"
          >
            <SkipFifteenIcon direction="back" />
          </button>
          <button
            onClick={togglePlay}
            className="w-14 h-14 rounded-full bg-primary hover:bg-primary/90 text-primary-foreground flex items-center justify-center shadow-lg transition-colors active:scale-95"
            aria-label={isPlaying ? "Pause" : "Play"}
          >
            {isPlaying ? (
              <Pause className="h-6 w-6" />
            ) : (
              <Play className="h-6 w-6 ml-0.5" />
            )}
          </button>
          <button
            onClick={skipForward}
            className={skipBtn}
            aria-label="Forward 15 seconds"
            title="Forward 15 seconds (→)"
          >
            <SkipFifteenIcon direction="forward" />
          </button>
        </div>

        {/* Right: loop + mute + volume */}
        <div className="flex items-center gap-1 justify-self-end">
          <button
            onClick={toggleLoop}
            className={`p-2 rounded-full transition-colors ${isLooping ? "text-primary" : dark ? "text-white/50 hover:text-white" : "text-muted-foreground hover:text-foreground"}`}
            aria-label="Toggle loop"
            aria-pressed={isLooping}
          >
            <Repeat className="h-4 w-4" />
          </button>
          <button
            onClick={toggleMute}
            className={iconBtn}
            aria-label={isMuted ? "Unmute" : "Mute"}
          >
            {isMuted ? (
              <VolumeX className="h-4 w-4" />
            ) : (
              <Volume2 className="h-4 w-4" />
            )}
          </button>
          <Slider
            value={[isMuted ? 0 : volume]}
            min={0}
            max={1}
            step={0.02}
            onValueChange={([v]) => handleVolumeChange(v)}
            className={cn("w-16 hidden sm:flex", darkSlider)}
            aria-label="Volume"
          />
        </div>
      </div>
    </div>
  );
}
