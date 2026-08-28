"use client";

/**
 * VoiceNoteButton — one-tap voice note for the current item.
 *
 * Tap: start recording (canonical `useSimpleRecorder` — captureLock + shared
 * mic + the ONE MediaRecorder controller). Tap again: stop; the blob goes to
 * the session's `addAudioNote`, which uploads it into the item's folder and
 * transcribes it in the background into the item's notes (the War Room
 * record-into-text pattern, minus the live-chunk engine a quick field note
 * doesn't need).
 */

import React, { useEffect } from "react";
import { Mic, Square } from "lucide-react";

import { useSimpleRecorder } from "@/features/audio/hooks/useSimpleRecorder";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";

interface VoiceNoteButtonProps {
  onRecordingComplete: (blob: Blob) => void;
  /** Fired when recording starts/stops so the host can pause the shutter
   *  (one live capture app-wide — the video recorder shares the lock). */
  onActiveChange?: (active: boolean) => void;
  disabled?: boolean;
}

function formatSeconds(total: number): string {
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function VoiceNoteButton({
  onRecordingComplete,
  onActiveChange,
  disabled,
}: VoiceNoteButtonProps) {
  const recorder = useSimpleRecorder({
    label: "Product voice note",
    onRecordingComplete,
    onError: (message) => toast.error(message),
  });

  useEffect(() => {
    onActiveChange?.(recorder.isRecording);
  }, [recorder.isRecording, onActiveChange]);

  const toggle = () => {
    if (recorder.isRecording) {
      recorder.stopRecording();
    } else {
      void recorder.startRecording();
    }
  };

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={disabled}
      aria-label={
        recorder.isRecording ? "Stop voice note" : "Record a voice note"
      }
      className={cn(
        "flex h-10 items-center gap-1.5 rounded-full px-3 text-sm font-medium transition-colors",
        recorder.isRecording
          ? "bg-red-600 text-white"
          : "bg-white/10 text-white/90 hover:bg-white/20",
        disabled && "opacity-40",
      )}
    >
      {recorder.isRecording ? (
        <>
          <Square className="h-4 w-4 fill-current" />
          <span className="tabular-nums">
            {formatSeconds(recorder.duration)}
          </span>
          <span
            className="ml-0.5 h-2 w-2 animate-pulse rounded-full bg-white"
            aria-hidden
          />
        </>
      ) : (
        <Mic className="h-4 w-4" />
      )}
    </button>
  );
}
