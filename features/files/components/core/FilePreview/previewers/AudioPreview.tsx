/**
 * features/files/components/core/FilePreview/previewers/AudioPreview.tsx
 *
 * Rich audio previewer — restored from the legacy
 * `components/ui/file-preview/previews/AudioPreview.tsx`. Bare HTML5
 * `<audio controls>` works but has zero affordances for the high-frequency
 * tasks users actually do with audio files: skip 10s, loop a sample,
 * change playback rate, scrub by clicking a timeline. This re-adds those.
 *
 * Intentionally avoids waveform rendering — wavesurfer.js isn't installed
 * and the bundle cost (>200KB) isn't worth it until users explicitly ask
 * for it. The legacy "waveform" was a CSS bar fake too.
 */

"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  Loader2,
  Music,
  Pause,
  Play,
  Repeat,
  RotateCcw,
  RotateCw,
  Volume2,
  VolumeX,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useRemintableSrc } from "@/features/files/handler/hooks/useRemintableSrc";

export interface AudioPreviewProps {
  url: string | null;
  fileName: string;
  mimeType: string | null;
  className?: string;
}

const PLAYBACK_RATES = [0.5, 0.75, 1, 1.25, 1.5, 2] as const;

function formatTime(seconds: number | undefined | null): string {
  if (seconds == null || !Number.isFinite(seconds)) return "0:00";
  const total = Math.max(0, Math.floor(seconds));
  const mm = Math.floor(total / 60);
  const ss = total % 60;
  return `${mm}:${ss.toString().padStart(2, "0")}`;
}

export function AudioPreview({
  url,
  fileName,
  mimeType,
  className,
}: AudioPreviewProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);

  // Media durability: an audio file served by a signed (expiring) URL re-mints
  // from its file_id on a load failure instead of dead-ending — a user's own
  // file never just "expires". `src` is the (possibly re-minted) URL to play;
  // `remintOnError` is wired to the <audio> error event; `remintFailed` flips
  // true only after re-mint is exhausted. Durable/foreign URLs pass through.
  const { src, onError: remintOnError, failed: remintFailed } =
    useRemintableSrc(url);

  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [position, setPosition] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [playbackRate, setPlaybackRate] = useState<number>(1);
  const [loop, setLoop] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [scrubbing, setScrubbing] = useState(false);

  // Keep playback state in sync with the underlying <audio>.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onLoadedMeta = () => {
      setDuration(audio.duration);
      setLoading(false);
    };
    const onTime = () => {
      if (!scrubbing) setPosition(audio.currentTime);
    };
    const onProgress = () => {
      try {
        if (audio.buffered.length > 0) {
          setBuffered(audio.buffered.end(audio.buffered.length - 1));
        }
      } catch {
        /* nothing buffered yet */
      }
    };
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onEnded = () => {
      if (!audio.loop) setPlaying(false);
    };
    const onWaiting = () => setLoading(true);
    const onCanPlay = () => setLoading(false);
    // The load-error path is handled by the <audio onError> prop
    // (`remintOnError`), which re-mints an expired owned URL before giving up.
    // The terminal "failed to load" message derives from the hook's
    // `remintFailed` (see `loadFailed`/`displayError` below).

    audio.addEventListener("loadedmetadata", onLoadedMeta);
    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("progress", onProgress);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("waiting", onWaiting);
    audio.addEventListener("canplay", onCanPlay);

    return () => {
      audio.removeEventListener("loadedmetadata", onLoadedMeta);
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("progress", onProgress);
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("waiting", onWaiting);
      audio.removeEventListener("canplay", onCanPlay);
    };
  }, [scrubbing]);

  // Reset transient state when the source URL changes (different file).
  useEffect(() => {
    setPlaying(false);
    setPosition(0);
    setDuration(0);
    setBuffered(0);
    setError(null);
    setLoading(true);
  }, [url]);

  // Keep the audio element's properties in sync with state.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.playbackRate = playbackRate;
  }, [playbackRate]);
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.loop = loop;
  }, [loop]);
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = volume;
    audio.muted = muted;
  }, [volume, muted]);

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      void audio.play().catch(() => {
        setError("Couldn't start playback.");
      });
    } else {
      audio.pause();
    }
  }, []);

  const skip = useCallback((deltaSec: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = Math.max(
      0,
      Math.min(audio.duration || 0, audio.currentTime + deltaSec),
    );
  }, []);

  // Scrubbing — pointer down/move/up on the track. We pause native
  // timeupdate writes via the `scrubbing` flag so the thumb tracks the
  // pointer cleanly.
  const updateFromPointer = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      const track = trackRef.current;
      const audio = audioRef.current;
      if (!track || !audio || !duration) return;
      const rect = track.getBoundingClientRect();
      const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const newTime = pct * duration;
      audio.currentTime = newTime;
      setPosition(newTime);
    },
    [duration],
  );

  const onTrackPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      setScrubbing(true);
      e.currentTarget.setPointerCapture(e.pointerId);
      updateFromPointer(e);
    },
    [updateFromPointer],
  );
  const onTrackPointerMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (!scrubbing) return;
      updateFromPointer(e);
    },
    [scrubbing, updateFromPointer],
  );
  const onTrackPointerUp = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (!scrubbing) return;
      setScrubbing(false);
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        /* may already be released */
      }
    },
    [scrubbing],
  );

  // ── Render ───────────────────────────────────────────────────────────────

  const positionPct = duration > 0 ? (position / duration) * 100 : 0;
  const bufferedPct = duration > 0 ? Math.min(100, (buffered / duration) * 100) : 0;

  // Terminal error shown to the user: a playback failure (`error`) OR an
  // exhausted re-mint of an expired owned URL (`remintFailed`). A recoverable
  // signed-URL expiry never reaches here — the hook re-mints first.
  const displayError =
    error ?? (remintFailed ? "This audio file failed to load." : null);

  return (
    <div
      className={cn(
        "flex h-full w-full flex-col items-center justify-center gap-6 p-6",
        className,
      )}
    >
      <div className="flex h-28 w-28 items-center justify-center rounded-full bg-muted">
        <Music className="h-12 w-12 text-pink-500" aria-hidden="true" />
      </div>

      <div className="w-full max-w-md text-center">
        <p className="truncate text-sm font-medium" title={fileName}>
          {fileName}
        </p>
        {mimeType ? (
          <p className="text-xs text-muted-foreground">{mimeType}</p>
        ) : null}
      </div>

      {/* Hidden native element drives playback; we only expose a custom UI. */}
      {url ? (
        <audio
          ref={audioRef}
          src={src}
          preload="metadata"
          className="hidden"
          onError={remintOnError}
        />
      ) : null}

      {/* Track */}
      <div className="w-full max-w-md flex flex-col gap-1">
        <div
          ref={trackRef}
          role="slider"
          aria-label="Audio scrubber"
          aria-valuemin={0}
          aria-valuemax={duration}
          aria-valuenow={position}
          tabIndex={0}
          onPointerDown={onTrackPointerDown}
          onPointerMove={onTrackPointerMove}
          onPointerUp={onTrackPointerUp}
          onPointerCancel={onTrackPointerUp}
          className="relative h-2 cursor-pointer rounded-full bg-muted touch-none"
        >
          {/* buffered */}
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-foreground/20"
            style={{ width: `${bufferedPct}%` }}
          />
          {/* progress */}
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-primary"
            style={{ width: `${positionPct}%` }}
          />
          {/* thumb */}
          {duration > 0 ? (
            <div
              className="absolute -top-1 h-4 w-4 -translate-x-1/2 rounded-full bg-primary shadow"
              style={{ left: `${positionPct}%` }}
              aria-hidden="true"
            />
          ) : null}
        </div>
        <div className="flex items-center justify-between text-[11px] text-muted-foreground tabular-nums">
          <span>{formatTime(position)}</span>
          <span>{formatTime(duration)}</span>
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-1.5">
        <ControlButton
          label="Skip back 10s"
          onClick={() => skip(-10)}
          disabled={!url || !!displayError}
        >
          <RotateCcw className="h-4 w-4" />
          <span className="text-[10px] font-semibold">10</span>
        </ControlButton>

        <button
          type="button"
          onClick={togglePlay}
          disabled={!url || !!displayError}
          aria-label={playing ? "Pause" : "Play"}
          className={cn(
            "flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow",
            "hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50",
          )}
        >
          {loading && url && !displayError ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : playing ? (
            <Pause className="h-5 w-5" />
          ) : (
            <Play className="h-5 w-5 translate-x-0.5" />
          )}
        </button>

        <ControlButton
          label="Skip forward 10s"
          onClick={() => skip(10)}
          disabled={!url || !!displayError}
        >
          <RotateCw className="h-4 w-4" />
          <span className="text-[10px] font-semibold">10</span>
        </ControlButton>
      </div>

      {/* Secondary controls: volume + rate + loop */}
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <label className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setMuted((m) => !m)}
            aria-label={muted ? "Unmute" : "Mute"}
            className="hover:text-foreground"
          >
            {muted || volume === 0 ? (
              <VolumeX className="h-3.5 w-3.5" />
            ) : (
              <Volume2 className="h-3.5 w-3.5" />
            )}
          </button>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={muted ? 0 : volume}
            onChange={(e) => {
              const v = Number(e.target.value);
              setVolume(v);
              if (v > 0 && muted) setMuted(false);
            }}
            aria-label="Volume"
            className="w-20 accent-primary"
          />
        </label>

        <label className="flex items-center gap-1.5">
          <span className="text-[10px] uppercase tracking-wide">Speed</span>
          <select
            value={playbackRate}
            onChange={(e) => setPlaybackRate(Number(e.target.value))}
            className="rounded-md border border-border bg-background px-1.5 py-0.5 text-xs"
          >
            {PLAYBACK_RATES.map((r) => (
              <option key={r} value={r}>
                {r}×
              </option>
            ))}
          </select>
        </label>

        <button
          type="button"
          onClick={() => setLoop((l) => !l)}
          aria-pressed={loop}
          aria-label="Loop"
          title={loop ? "Loop on" : "Loop off"}
          className={cn(
            "flex items-center gap-1 rounded-md px-2 py-0.5",
            loop ? "bg-primary/10 text-primary" : "hover:bg-accent hover:text-foreground",
          )}
        >
          <Repeat className="h-3.5 w-3.5" />
          Loop
        </button>
      </div>

      {displayError ? (
        <p className="text-xs text-destructive" role="alert">
          {displayError}
        </p>
      ) : null}
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────

function ControlButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={cn(
        "relative flex h-9 w-9 flex-col items-center justify-center rounded-full",
        "text-muted-foreground hover:bg-accent hover:text-foreground",
        "disabled:cursor-not-allowed disabled:opacity-50",
      )}
    >
      {children}
    </button>
  );
}

export default AudioPreview;
