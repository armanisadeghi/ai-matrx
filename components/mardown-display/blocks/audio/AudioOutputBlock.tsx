"use client";
import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  Repeat,
  Music,
  Download,
  Link,
  Check,
  Loader2,
  LayoutTemplate,
  Rows2,
} from "lucide-react";
import { Slider } from "@/components/ui/slider";

export interface AudioOutputBlockProps {
  /** URL to the audio file */
  url: string;
  /** MIME type, e.g. "audio/wav" */
  mimeType?: string;
  /** Optional track title */
  title?: string;
  /** Optional artist / source label */
  artist?: string;
  /** Optional cover art URL */
  cover?: string;
  /** Default layout mode */
  defaultMode?: "portrait" | "landscape";
}

/* ─────────────────────────────────────────────────────────────────────────────
   Shared utilities
───────────────────────────────────────────────────────────────────────────── */

function formatTime(t: number): string {
  if (!t || isNaN(t)) return "0:00";
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${s < 10 ? "0" : ""}${s}`;
}

/* Animated equalizer bars — purely CSS, no JS timers */
function EqualizerBars({ active }: { active: boolean }) {
  return (
    <div
      className="flex items-end justify-center gap-[2px] h-5 w-8"
      aria-hidden
    >
      {[0, 1, 2, 3].map((i) => (
        <span
          key={i}
          className="w-[3px] rounded-full bg-primary transition-all duration-300"
          style={{
            height: active ? `${[60, 90, 45, 75][i]}%` : "20%",
            animation: active
              ? `eq-bounce ${0.6 + i * 0.15}s ease-in-out infinite alternate`
              : "none",
          }}
        />
      ))}
      <style>{`
        @keyframes eq-bounce {
          from { transform: scaleY(0.4); }
          to   { transform: scaleY(1);   }
        }
      `}</style>
    </div>
  );
}

/* Themed progress / volume range track */
function RangeInput({
  min,
  max,
  value,
  step,
  onChange,
  accentVar = "hsl(var(--primary))",
  className = "",
}: {
  min: number;
  max: number;
  value: number;
  step?: number;
  onChange: (v: number) => void;
  accentVar?: string;
  className?: string;
}) {
  return (
    <Slider
      min={min}
      max={max || 0}
      step={step ?? 1}
      value={[value]}
      onValueChange={([v]) => onChange(v)}
      className={`w-full ${className}`}
    />
  );
}

/* Cover art — shows supplied image or a beautiful branded placeholder */
function CoverArt({
  src,
  title,
  isPlaying,
  size = "full",
}: {
  src?: string | null;
  title?: string;
  isPlaying: boolean;
  size?: "full" | "small";
}) {
  const small = size === "small";
  return (
    <div
      className={`relative overflow-hidden ${small ? "w-16 h-16 rounded-xl flex-shrink-0" : "w-full aspect-square rounded-2xl"} shadow-lg`}
    >
      {src ? (
        <img
          src={src}
          alt={title ?? "Album art"}
          className={`w-full h-full object-cover transition-transform duration-700 ${isPlaying ? "scale-110" : "scale-100"}`}
        />
      ) : (
        /* Branded placeholder using our theme gradients */
        <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-[hsl(var(--primary)/0.15)] to-[hsl(var(--secondary)/0.15)] border border-border">
          <div
            className={`transition-all duration-700 ${isPlaying ? "scale-110 opacity-100" : "scale-90 opacity-60"}`}
          >
            {small ? (
              <Music size={24} className="text-primary" strokeWidth={1.5} />
            ) : (
              <div className="flex flex-col items-center gap-3">
                <div
                  className={`p-5 rounded-full border border-border bg-background/40 backdrop-blur-sm transition-all duration-700 ${isPlaying ? "shadow-lg shadow-primary/20" : ""}`}
                >
                  <Music size={48} className="text-primary" strokeWidth={1.5} />
                </div>
                {/* Animated glow ring when playing */}
                {isPlaying && (
                  <div className="absolute inset-0 pointer-events-none">
                    <div className="absolute inset-4 rounded-full bg-primary/5 animate-ping" />
                  </div>
                )}
                <span className="text-[10px] font-bold tracking-[0.2em] text-muted-foreground/60 uppercase">
                  No Artwork
                </span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   Shared audio engine hook
───────────────────────────────────────────────────────────────────────────── */

function useAudioEngine(url: string) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.8);
  const [isMuted, setIsMuted] = useState(false);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onTime = () => setCurrentTime(audio.currentTime);
    const onMeta = () => setDuration(audio.duration);
    const onEnd = () => setIsPlaying(false);
    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("loadedmetadata", onMeta);
    audio.addEventListener("ended", onEnd);
    return () => {
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("loadedmetadata", onMeta);
      audio.removeEventListener("ended", onEnd);
    };
  }, []);

  // Sync play/pause
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) {
      audio.play().catch(() => setIsPlaying(false));
    } else {
      audio.pause();
    }
  }, [isPlaying]);

  const togglePlay = useCallback(() => setIsPlaying((p) => !p), []);

  const seek = useCallback((t: number) => {
    setCurrentTime(t);
    if (audioRef.current) audioRef.current.currentTime = t;
  }, []);

  const changeVolume = useCallback((v: number) => {
    setVolume(v);
    setIsMuted(v === 0);
    if (audioRef.current) audioRef.current.volume = v;
  }, []);

  const toggleMute = useCallback(() => {
    const next = !isMuted;
    setIsMuted(next);
    if (audioRef.current) audioRef.current.volume = next ? 0 : volume;
  }, [isMuted, volume]);

  return {
    audioRef,
    isPlaying,
    togglePlay,
    currentTime,
    duration,
    seek,
    volume,
    isMuted,
    changeVolume,
    toggleMute,
  };
}

/* ─────────────────────────────────────────────────────────────────────────────
   Download / copy-link helpers (shared)
───────────────────────────────────────────────────────────────────────────── */

function useFileActions(url: string, mimeType?: string) {
  const [isDownloading, setIsDownloading] = useState(false);
  const [isCopied, setIsCopied] = useState(false);

  const download = useCallback(async () => {
    if (isDownloading) return;
    setIsDownloading(true);
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      const obj = URL.createObjectURL(blob);
      const ext = mimeType?.split("/")[1] ?? "wav";
      const a = document.createElement("a");
      a.href = obj;
      a.download = `audio-response.${ext}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(obj);
    } catch {
      /* silent */
    } finally {
      setIsDownloading(false);
    }
  }, [url, mimeType, isDownloading]);

  const copyLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(url);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    } catch {
      /* silent */
    }
  }, [url]);

  return { isDownloading, download, isCopied, copyLink };
}

/* ─────────────────────────────────────────────────────────────────────────────
   Portrait player (card with cover art above controls)
───────────────────────────────────────────────────────────────────────────── */

interface PlayerProps {
  url: string;
  mimeType?: string;
  title: string;
  artist: string;
  cover?: string | null;
}

function PortraitPlayer({ url, mimeType, title, artist, cover }: PlayerProps) {
  const {
    audioRef,
    isPlaying,
    togglePlay,
    currentTime,
    duration,
    seek,
    volume,
    isMuted,
    changeVolume,
    toggleMute,
  } = useAudioEngine(url);
  const { isDownloading, download, isCopied, copyLink } = useFileActions(
    url,
    mimeType,
  );
  const [isRepeat, setIsRepeat] = useState(false);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.loop = isRepeat;
    }
  }, [isRepeat, audioRef]);

  return (
    <div className="w-full max-w-sm mx-auto">
      <audio ref={audioRef} src={url} />

      {/* Cover */}
      <div className="px-1 mb-4">
        <CoverArt src={cover} title={title} isPlaying={isPlaying} />
      </div>

      {/* Title */}
      <div className="px-1 mb-4 flex items-center justify-between">
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-foreground text-base leading-tight line-clamp-1">
            {title}
          </p>
          <p className="text-sm text-muted-foreground mt-0.5 line-clamp-1">
            {artist}
          </p>
        </div>
        <EqualizerBars active={isPlaying} />
      </div>

      {/* Progress */}
      <div className="px-1 mb-5">
        <RangeInput
          min={0}
          max={duration}
          value={currentTime}
          onChange={seek}
          className="audio-range"
        />
        <div className="flex justify-between mt-1.5 text-[10px] font-mono text-muted-foreground">
          <span>{formatTime(currentTime)}</span>
          <span>{formatTime(duration)}</span>
        </div>
      </div>

      {/* Controls */}
      <div className="px-1 flex items-center justify-between mb-4">
        <button
          onClick={() => setIsRepeat((r) => !r)}
          className={`p-2 rounded-full transition-colors ${isRepeat ? "text-primary bg-primary/10" : "text-muted-foreground hover:text-foreground hover:bg-accent"}`}
          title="Repeat"
        >
          <Repeat size={16} />
        </button>

        <div className="flex items-center gap-3">
          <button
            onClick={() => seek(Math.max(0, currentTime - 10))}
            className="p-2 text-muted-foreground hover:text-foreground hover:bg-accent rounded-full transition-colors"
            title="Back 10s"
          >
            <SkipBack size={22} />
          </button>
          <button
            onClick={togglePlay}
            className="w-12 h-12 flex items-center justify-center bg-primary text-primary-foreground rounded-full shadow-md hover:scale-105 active:scale-95 transition-all"
          >
            {isPlaying ? (
              <Pause size={22} fill="currentColor" />
            ) : (
              <Play size={22} fill="currentColor" className="ml-0.5" />
            )}
          </button>
          <button
            onClick={() => seek(Math.min(duration, currentTime + 10))}
            className="p-2 text-muted-foreground hover:text-foreground hover:bg-accent rounded-full transition-colors"
            title="Forward 10s"
          >
            <SkipForward size={22} />
          </button>
        </div>

        <button
          onClick={toggleMute}
          className="p-2 rounded-full text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          title={isMuted ? "Unmute" : "Mute"}
        >
          {isMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
        </button>
      </div>

      {/* Volume */}
      <div className="px-1 mb-4 flex items-center gap-2">
        <VolumeX size={12} className="text-muted-foreground flex-shrink-0" />
        <RangeInput
          min={0}
          max={1}
          step={0.01}
          value={isMuted ? 0 : volume}
          onChange={changeVolume}
          className="audio-range"
        />
        <Volume2 size={12} className="text-muted-foreground flex-shrink-0" />
      </div>

      {/* File actions */}
      <div className="px-1 flex items-center gap-1 border-t border-border pt-3">
        <button
          onClick={download}
          disabled={isDownloading}
          className="flex items-center gap-1 px-2 py-1 text-xs text-primary hover:bg-primary/10 rounded-md transition-colors disabled:opacity-50"
        >
          {isDownloading ? (
            <Loader2 size={12} className="animate-spin" />
          ) : (
            <Download size={12} />
          )}
          {isDownloading ? "Downloading…" : "Download"}
        </button>
        <button
          onClick={copyLink}
          className="flex items-center gap-1 px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-accent rounded-md transition-colors"
        >
          {isCopied ? <Check size={12} /> : <Link size={12} />}
          {isCopied ? "Copied!" : "Copy link"}
        </button>
        {mimeType && (
          <span className="ml-auto text-[10px] font-mono px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
            {mimeType}
          </span>
        )}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   Landscape player (cover thumbnail left, info + controls right)
───────────────────────────────────────────────────────────────────────────── */

function LandscapePlayer({ url, mimeType, title, artist, cover }: PlayerProps) {
  const {
    audioRef,
    isPlaying,
    togglePlay,
    currentTime,
    duration,
    seek,
    volume,
    isMuted,
    changeVolume,
    toggleMute,
  } = useAudioEngine(url);
  const { isDownloading, download, isCopied, copyLink } = useFileActions(
    url,
    mimeType,
  );
  const [isRepeat, setIsRepeat] = useState(false);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.loop = isRepeat;
    }
  }, [isRepeat, audioRef]);

  return (
    <div className="w-full">
      <audio ref={audioRef} src={url} />

      <div className="flex gap-4 items-start">
        {/* Cover thumbnail */}
        <CoverArt
          src={cover}
          title={title}
          isPlaying={isPlaying}
          size="small"
        />

        {/* Right column */}
        <div className="flex-1 min-w-0">
          {/* Title row */}
          <div className="flex items-center justify-between mb-2">
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-foreground text-sm leading-tight line-clamp-1">
                {title}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                {artist}
              </p>
            </div>
            <EqualizerBars active={isPlaying} />
          </div>

          {/* Progress */}
          <div className="mb-2">
            <RangeInput
              min={0}
              max={duration}
              value={currentTime}
              onChange={seek}
              className="audio-range"
            />
            <div className="flex justify-between mt-1 text-[10px] font-mono text-muted-foreground">
              <span>{formatTime(currentTime)}</span>
              <span>{formatTime(duration)}</span>
            </div>
          </div>

          {/* Controls row */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1">
              <button
                onClick={() => seek(Math.max(0, currentTime - 10))}
                className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-accent rounded-full transition-colors"
              >
                <SkipBack size={16} />
              </button>
              <button
                onClick={togglePlay}
                className="w-9 h-9 flex items-center justify-center bg-primary text-primary-foreground rounded-full shadow hover:scale-105 active:scale-95 transition-all"
              >
                {isPlaying ? (
                  <Pause size={16} fill="currentColor" />
                ) : (
                  <Play size={16} fill="currentColor" className="ml-0.5" />
                )}
              </button>
              <button
                onClick={() => seek(Math.min(duration, currentTime + 10))}
                className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-accent rounded-full transition-colors"
              >
                <SkipForward size={16} />
              </button>
              <button
                onClick={() => setIsRepeat((r) => !r)}
                className={`p-1.5 rounded-full transition-colors ${isRepeat ? "text-primary" : "text-muted-foreground hover:text-foreground hover:bg-accent"}`}
              >
                <Repeat size={14} />
              </button>
            </div>

            {/* Volume mini */}
            <div className="flex items-center gap-1.5 w-28">
              <button
                onClick={toggleMute}
                className="text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
              >
                {isMuted ? <VolumeX size={14} /> : <Volume2 size={14} />}
              </button>
              <RangeInput
                min={0}
                max={1}
                step={0.01}
                value={isMuted ? 0 : volume}
                onChange={changeVolume}
                className="audio-range"
              />
            </div>
          </div>

          {/* File actions */}
          <div className="flex items-center gap-1 mt-2 pt-2 border-t border-border">
            <button
              onClick={download}
              disabled={isDownloading}
              className="flex items-center gap-1 px-2 py-0.5 text-[11px] text-primary hover:bg-primary/10 rounded-md transition-colors disabled:opacity-50"
            >
              {isDownloading ? (
                <Loader2 size={10} className="animate-spin" />
              ) : (
                <Download size={10} />
              )}
              {isDownloading ? "Downloading…" : "Download"}
            </button>
            <button
              onClick={copyLink}
              className="flex items-center gap-1 px-2 py-0.5 text-[11px] text-muted-foreground hover:text-foreground hover:bg-accent rounded-md transition-colors"
            >
              {isCopied ? <Check size={10} /> : <Link size={10} />}
              {isCopied ? "Copied!" : "Copy link"}
            </button>
            {mimeType && (
              <span className="ml-auto text-[10px] font-mono px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                {mimeType}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   Layout toggle button — animates between portrait ↔ landscape icons
───────────────────────────────────────────────────────────────────────────── */

function LayoutToggle({
  mode,
  onToggle,
}: {
  mode: "portrait" | "landscape";
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      title={
        mode === "portrait" ? "Switch to compact view" : "Switch to full view"
      }
      className="absolute top-3 right-3 p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-all z-10 group"
    >
      {/* Animated icon flip */}
      <span className="relative flex items-center justify-center w-4 h-4">
        <LayoutTemplate
          size={14}
          className={`absolute transition-all duration-300 ${mode === "portrait" ? "opacity-100 rotate-0 scale-100" : "opacity-0 rotate-90 scale-75"}`}
        />
        <Rows2
          size={14}
          className={`absolute transition-all duration-300 ${mode === "landscape" ? "opacity-100 rotate-0 scale-100" : "opacity-0 -rotate-90 scale-75"}`}
        />
      </span>
    </button>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   AudioOutputBlock — the public API used by BlockRenderer
───────────────────────────────────────────────────────────────────────────── */

const AudioOutputBlock: React.FC<AudioOutputBlockProps> = ({
  url,
  mimeType,
  title,
  artist,
  cover,
  defaultMode = "landscape",
}) => {
  const [mode, setMode] = useState<"portrait" | "landscape">(defaultMode);

  const resolvedTitle =
    title ?? (mimeType ? `Audio (${mimeType})` : "Audio Response");
  const resolvedArtist = artist ?? "AI Generated";

  return (
    <div className="relative rounded-xl border border-border bg-card p-4 my-2 shadow-sm">
      <LayoutToggle
        mode={mode}
        onToggle={() =>
          setMode((m) => (m === "portrait" ? "landscape" : "portrait"))
        }
      />

      <div
        className={`transition-all duration-300 ${mode === "portrait" ? "max-h-[600px]" : "max-h-[200px]"} overflow-hidden`}
      >
        {mode === "portrait" ? (
          <PortraitPlayer
            url={url}
            mimeType={mimeType}
            title={resolvedTitle}
            artist={resolvedArtist}
            cover={cover}
          />
        ) : (
          <LandscapePlayer
            url={url}
            mimeType={mimeType}
            title={resolvedTitle}
            artist={resolvedArtist}
            cover={cover}
          />
        )}
      </div>
    </div>
  );
};

export default AudioOutputBlock;
