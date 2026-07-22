"use client";

/**
 * features/media-capture/components/RecordingHud.tsx
 *
 * The recording heads-up display for video and audio captures, modeled on the
 * transcripts recorder (`features/transcripts/components/RecordingInterface.tsx`)
 * — the house template for a ceremonial recorder: a big monospace timer, a
 * live level meter, Duration and Estimated Size gauges against the real caps,
 * and an orange alert as a cap approaches.
 *
 * Honest numbers only:
 * - elapsed comes from the recorder controller's PAUSE-AWARE MONOTONIC clock
 *   (`performance.now()`), never from chunk arrival — chunk timing is
 *   unreliable under tab suspension and screen lock.
 * - the size gauge reads the controller's projected size, which is the SAME
 *   number the `maxBytes` hard stop enforces, so the gauge can never disagree
 *   with the stop the user is about to hit.
 * - the level meter taps the COMPOSED recording stream, so it shows what is
 *   actually being recorded (and correctly reads 0 with the mic off).
 */

import {
  AlertTriangle,
  Mic,
  MicOff,
  Pause,
  Play,
  Square,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AudioLevelIndicator } from "@/features/audio/components/AudioLevelIndicator";
import { cn } from "@/lib/utils";

/** Past this fraction of a cap the gauge turns red and the alert appears. */
const WARN_FRACTION = 0.8;

export interface RecordingHudProps {
  kind: "video" | "audio";
  paused: boolean;
  elapsedMs: number;
  maxDurationMs: number;
  estimatedBytes: number;
  maxBytes: number;
  /** 0-100 from the composed recording stream. */
  audioLevel: number;
  /** False when the user recorded video with the mic off. */
  hasAudio: boolean;
  onPauseResume: () => void;
  onStop: () => void;
  onCancel: () => void;
  className?: string;
}

export function formatClock(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const mm = `${m}`.padStart(2, "0");
  const ss = `${s}`.padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function RecordingHud({
  kind,
  paused,
  elapsedMs,
  maxDurationMs,
  estimatedBytes,
  maxBytes,
  audioLevel,
  hasAudio,
  onPauseResume,
  onStop,
  onCancel,
  className,
}: RecordingHudProps) {
  const durationPct = Math.min(100, (elapsedMs / maxDurationMs) * 100);
  const sizePct = Math.min(100, (estimatedBytes / maxBytes) * 100);
  const nearDurationCap = durationPct >= WARN_FRACTION * 100;
  const nearSizeCap = sizePct >= WARN_FRACTION * 100;

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      {/* Timer + REC state + live level */}
      <div className="flex items-center gap-3">
        <span
          className={cn(
            "h-2.5 w-2.5 shrink-0 rounded-full",
            paused ? "bg-muted-foreground" : "animate-pulse bg-destructive",
          )}
          aria-hidden
        />
        <div className="min-w-0">
          <div
            className="text-3xl font-mono font-bold tabular-nums leading-none text-foreground"
            aria-live="off"
          >
            {formatClock(elapsedMs)}
          </div>
          <div className="mt-1 text-xs text-muted-foreground" aria-live="polite">
            {paused
              ? "Paused"
              : kind === "video"
                ? "Recording video"
                : "Recording audio"}
          </div>
        </div>

        <div className="ml-auto flex items-center gap-2">
          {hasAudio ? (
            <>
              <Mic className="h-4 w-4 text-muted-foreground" />
              <AudioLevelIndicator
                level={paused ? 0 : audioLevel}
                barCount={9}
                color="green"
                className="h-5"
              />
            </>
          ) : (
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <MicOff className="h-4 w-4" />
              No microphone
            </span>
          )}
        </div>
      </div>

      {/* Gauges against the real controller-enforced caps */}
      <div className="space-y-2">
        <div>
          <div className="mb-1 flex justify-between text-xs text-muted-foreground">
            <span>Duration</span>
            <span className="tabular-nums">
              {formatClock(elapsedMs)} / {formatClock(maxDurationMs)}
            </span>
          </div>
          <Progress
            value={durationPct}
            className={cn("h-2", nearDurationCap && "bg-red-100 dark:bg-red-900/20")}
          />
        </div>
        <div>
          <div className="mb-1 flex justify-between text-xs text-muted-foreground">
            <span>Estimated size</span>
            <span className="tabular-nums">
              {formatBytes(estimatedBytes)} / {formatBytes(maxBytes)}
            </span>
          </div>
          <Progress
            value={sizePct}
            className={cn("h-2", nearSizeCap && "bg-red-100 dark:bg-red-900/20")}
          />
        </div>
      </div>

      {(nearDurationCap || nearSizeCap) && (
        <Alert className="border-orange-200 bg-orange-50 dark:border-orange-800 dark:bg-orange-900/20">
          <AlertTriangle className="h-4 w-4 text-orange-600 dark:text-orange-400" />
          <AlertDescription className="text-xs text-orange-800 dark:text-orange-300">
            {nearSizeCap
              ? `Approaching the maximum size — recording stops automatically at ${formatBytes(maxBytes)}.`
              : `Approaching the maximum duration — recording stops automatically at ${formatClock(maxDurationMs)}.`}{" "}
            Everything captured so far is kept.
          </AlertDescription>
        </Alert>
      )}

      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          className="h-11 sm:h-9"
          onClick={onPauseResume}
          aria-label={paused ? "Resume recording" : "Pause recording"}
        >
          {paused ? (
            <Play className="mr-1.5 h-4 w-4" />
          ) : (
            <Pause className="mr-1.5 h-4 w-4" />
          )}
          {paused ? "Resume" : "Pause"}
        </Button>
        <Button
          variant="destructive"
          size="sm"
          className="h-11 flex-1 sm:h-9"
          onClick={onStop}
          aria-label="Stop recording and review"
        >
          <Square className="mr-1.5 h-4 w-4" />
          Stop
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-11 sm:h-9"
          onClick={onCancel}
          aria-label="Discard recording"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
