/**
 * Combined Recording and Transcription Hook — COMPATIBILITY SHIM
 *
 * Historically each call site spun up its OWN `useChunkedRecordAndTranscribe`
 * instance, which is exactly how two surfaces could record at the same time and
 * how a recording died on route change. This hook now delegates to the ONE
 * shared recorder behind `GlobalRecordingProvider` (via `useVoiceCapture`), so
 * every legacy consumer inherits the canonical behavior with zero edits:
 *
 *   • one recording at a time, app-wide (concurrent recording is impossible),
 *   • start-always-wins (starting here takes over any other surface),
 *   • the recording survives navigation / tab switches,
 *   • crash-safe IndexedDB persistence + recovery.
 *
 * The original return/prop shape is preserved so existing callers keep working.
 * New code should consume `useVoiceCapture` (button surfaces) or `useMicField`
 * (text-field surfaces) directly — this shim exists only to carry the remaining
 * legacy call sites until they're migrated off.
 *
 * Behavioral notes vs. the old per-instance hook:
 *   • `streaming` / `transcriptionOptions` are ignored — the shared session is
 *     always chunked + auto-transcribed (the universal default; no caller
 *     relied otherwise).
 *   • `failedChunkCount` is not surfaced per-instance (always 0). No caller
 *     consumed it; the global failed-chunk count lives in `state.recordings`.
 *   • `reset()` now means "discard this recording" (cancel) on the shared
 *     session, matching its only real use (a RecordingOverlay cancel button).
 */

"use client";

import { useCallback, useEffect, useRef } from "react";
import { useVoiceCapture } from "./useVoiceCapture";
import { TranscriptionOptions, TranscriptionResult } from "../types";

export interface UseRecordAndTranscribeProps {
  onTranscriptionComplete?: (result: TranscriptionResult) => void;
  onChunkTranscribed?: (chunkText: string, accumulatedText: string) => void;
  onChunkError?: (chunkIndex: number, error: string) => void;
  onError?: (error: string, errorCode?: string) => void;
  autoTranscribe?: boolean;
  /** @deprecated The shared session is always chunked-streaming. Ignored. */
  streaming?: boolean;
  /** @deprecated Ignored — the shared session uses the default options. */
  transcriptionOptions?: TranscriptionOptions;
}

export function useRecordAndTranscribe({
  onTranscriptionComplete,
  onChunkTranscribed,
  onError,
  autoTranscribe = true,
}: UseRecordAndTranscribeProps = {}) {
  // Latest callbacks without re-creating the capture wiring each render.
  const cbRef = useRef({
    onTranscriptionComplete,
    onChunkTranscribed,
    onError,
    autoTranscribe,
  });
  cbRef.current = {
    onTranscriptionComplete,
    onChunkTranscribed,
    onError,
    autoTranscribe,
  };

  const capture = useVoiceCapture({
    onTranscript: (_text, result) => {
      if (cbRef.current.autoTranscribe === false) return;
      cbRef.current.onTranscriptionComplete?.(result);
    },
    onError: (message, code) => {
      cbRef.current.onError?.(message, code);
    },
  });

  const { isRecording, isTranscribing, liveTranscript } = capture;

  // Re-create the legacy per-chunk callback from the live transcript stream:
  // fire with (newlyAdded, fullAccumulated) as chunks land. Owner-gated, so a
  // recording on another surface never bleeds into this consumer's callback.
  const prevLiveRef = useRef("");
  useEffect(() => {
    if (!isRecording && !isTranscribing) {
      prevLiveRef.current = "";
      return;
    }
    if (!liveTranscript || liveTranscript === prevLiveRef.current) return;
    const prev = prevLiveRef.current;
    const delta = liveTranscript.startsWith(prev)
      ? liveTranscript.slice(prev.length)
      : liveTranscript;
    prevLiveRef.current = liveTranscript;
    cbRef.current.onChunkTranscribed?.(delta, liveTranscript);
  }, [liveTranscript, isRecording, isTranscribing]);

  const startRecording = useCallback(() => capture.start(), [capture]);
  const stopRecording = useCallback(() => capture.stop(), [capture]);
  const pauseRecording = useCallback(() => capture.pause(), [capture]);
  const resumeRecording = useCallback(() => capture.resume(), [capture]);
  // Legacy `reset()` was the cancel/discard affordance — map to a true discard.
  const reset = useCallback(() => capture.cancel(), [capture]);

  return {
    isRecording,
    isPaused: capture.isPaused,
    duration: capture.durationSec,
    audioLevel: capture.audioLevel,
    isTranscribing,
    liveTranscript,
    failedChunkCount: 0,
    isProcessing: isRecording || isTranscribing,
    startRecording,
    stopRecording,
    pauseRecording,
    resumeRecording,
    reset,
  };
}
