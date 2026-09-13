"use client";

// features/masterwork/record/MonologueRecorder.tsx
//
// THE VOICE-FIRST DOOR'S capture panel — "just talk for an hour and we'll do
// the rest".
//
// Arman's expertise mandate puts voice capture first, and the server lane has
// existed for weeks (`aidream/services/distillation/file_ingest.py`
// `_distill_transcript`: transcribe, chunk by transcript time range, distill
// through `masterwork.monologue_distiller`, anchor every rule to the moment it
// was said). The `monologue` Approach sat `enabled=false` for one reason: no
// product door. The only way in was the generic "Upload a file" card, which
// asks an Expert who wants to TALK to first go and make a recording somewhere
// else.
//
// This is deliberately NOT a second recorder. `useSimpleRecorder` is the
// platform's one browser-capture primitive — it holds the app-wide capture
// lock (one live microphone anywhere), the shared mic singleton, the audio
// session registry row the Audio panel reads, and the MIME ladder. This file
// only puts a face on it.

import { useEffect, useRef, useState } from "react";
import { Mic, Pause, Play, Square, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useSimpleRecorder } from "@/features/audio/hooks/useSimpleRecorder";

/** `m:ss` — the only clock a person talking needs. */
export function formatTalkTime(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

/**
 * WHAT THE WAIT WILL ACTUALLY BE, promised before it starts.
 *
 * The methods census found ingest runtimes that die silently behind an
 * unbounded spinner. A recording is the worst case for that: an hour of audio
 * is transcribed and then distilled chunk by chunk, and a person who was told
 * nothing assumes it hung. Transcription plus distillation runs at roughly a
 * tenth of real time with a fixed minute of overhead, so the promise is stated
 * as a RANGE and rounded outward — an honest over-estimate beats a cheerful
 * one that is wrong.
 */
export function describeDistillWait(recordedSeconds: number): string {
  const minutes = Math.max(1, Math.ceil((60 + recordedSeconds * 0.1) / 60));
  if (minutes <= 2) return "Writing it down and distilling it usually takes a minute or two.";
  return `Writing it down and distilling it usually takes about ${minutes}–${minutes * 2} minutes.`;
}

export function MonologueRecorder({
  onRecorded,
  disabled = false,
}: {
  /** A finished recording, with the seconds it ran for. */
  onRecorded: (blob: Blob, seconds: number) => void;
  disabled?: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  // The recorder's own `duration` resets with the hook; the FINISHED length is
  // read at the moment of delivery, because the blob and the clock must agree.
  const durationAtStopRef = useRef(0);
  const [finishedSeconds, setFinishedSeconds] = useState<number | null>(null);

  const {
    isRecording,
    isPaused,
    duration,
    audioBlob,
    audioLevel,
    startRecording,
    stopRecording,
    pauseRecording,
    resumeRecording,
    reset,
  } = useSimpleRecorder({
    label: "Masterwork monologue",
    onRecordingComplete: (blob) => {
      const seconds = durationAtStopRef.current;
      setFinishedSeconds(seconds);
      onRecorded(blob, seconds);
    },
    // NOTHING FAILS SILENTLY: a mic that is blocked, in use, or missing says so
    // on screen, next to the button that did nothing.
    onError: (message) => setError(message),
  });

  useEffect(() => {
    if (isRecording) durationAtStopRef.current = duration;
  }, [isRecording, duration]);

  const discard = () => {
    reset();
    setFinishedSeconds(null);
    setError(null);
  };

  if (audioBlob && finishedSeconds !== null) {
    return (
      <div className="space-y-2 rounded-md border border-border bg-card p-4">
        <p className="text-sm font-medium text-foreground">
          {formatTalkTime(finishedSeconds)} recorded
        </p>
        <p className="text-xs text-muted-foreground">
          {describeDistillWait(finishedSeconds)}
        </p>
        <Button variant="outline" size="sm" onClick={discard} disabled={disabled}>
          <Trash2 className="mr-1.5 h-3.5 w-3.5" />
          Record it again
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-md border border-border bg-card p-4">
      {isRecording ? (
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <span
              className={cn(
                "h-2.5 w-2.5 rounded-full",
                isPaused ? "bg-muted-foreground" : "animate-pulse bg-red-500",
              )}
              aria-hidden
            />
            <span className="font-mono text-lg tabular-nums text-foreground">
              {formatTalkTime(duration)}
            </span>
            <span className="text-xs text-muted-foreground">
              {isPaused ? "Paused" : "Listening — take your time"}
            </span>
          </div>
          {/* A LIVE level, so a muted or dead microphone is visible in the
              first seconds rather than after an hour of silence. */}
          <div
            className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
            role="meter"
            aria-label="Microphone level"
            aria-valuenow={Math.round(Math.min(1, audioLevel) * 100)}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-100"
              style={{ width: `${Math.min(100, Math.round(audioLevel * 140))}%` }}
            />
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => (isPaused ? resumeRecording() : pauseRecording())}
              disabled={disabled}
            >
              {isPaused ? (
                <>
                  <Play className="mr-1.5 h-3.5 w-3.5" /> Keep going
                </>
              ) : (
                <>
                  <Pause className="mr-1.5 h-3.5 w-3.5" /> Pause
                </>
              )}
            </Button>
            <Button size="sm" onClick={() => stopRecording()} disabled={disabled}>
              <Square className="mr-1.5 h-3.5 w-3.5" /> Done talking
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <Button
            onClick={() => void startRecording()}
            disabled={disabled}
            className="w-full"
          >
            <Mic className="mr-2 h-4 w-4" />
            Start talking
          </Button>
          <p className="text-xs text-muted-foreground">
            Rambling is fine. Pause whenever you like — nothing is sent until
            you say you are done.
          </p>
        </div>
      )}
      {error ? (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
