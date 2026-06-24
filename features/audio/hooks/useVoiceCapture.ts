"use client";

// features/audio/hooks/useVoiceCapture.ts
//
// THE stable client API for voice-to-text on any input surface (ProTextarea,
// ProInput, prompt/agent/notes inputs, …). Every such surface consumes this
// hook instead of spinning up its own `useRecordAndTranscribe` instance.
//
// WHY
// ---
// Previously ~20 surfaces each instantiated their own recorder hook, so two
// surfaces could record at once and a recording died on route change. This hook
// drives the ONE shared recorder behind `GlobalRecordingProvider`, so:
//   • concurrent recording is structurally impossible (one recorder, app-wide),
//   • start-always-wins — starting here instantly takes over any other surface,
//   • a recording survives navigation/tab switches (the provider is app-root).
//
// Each consumer passes a stable `instanceId`; the hook reports whether THIS
// instance currently owns the recorder, so its live transcript / level glow
// only reflect its own session. Non-owning instances read inert values (0, "")
// so the owner's ~60fps level ticks never re-render every other mic on screen.

import { useCallback, useId, useRef } from "react";
import { useAppSelector } from "@/lib/redux/hooks";
import {
  useGlobalRecordingOptional,
  type GlobalRecordingApi,
} from "@/providers/GlobalRecordingProvider";
import type { TranscriptionResult } from "@/features/audio/types";

export interface UseVoiceCaptureOptions {
  /** Stable id for this surface. Defaults to a generated id (fine for a single
   *  mic per component). Pass an explicit id when several mics share a key. */
  instanceId?: string;
  /** Human label for the global awareness indicator ("Recording — Agent message"). */
  label?: string;
  /** Final accumulated transcript when this recording stops + finishes. */
  onTranscript?: (finalText: string, result: TranscriptionResult) => void;
  /** Capture-level errors (permission denied, mic interrupted, …). */
  onError?: (message: string, code?: string) => void;
}

export interface UseVoiceCaptureResult {
  /** True iff THIS surface owns the recorder AND it is actively recording. */
  isRecording: boolean;
  /** True iff ANY surface is recording (used to disable other mics' affordances). */
  isAnyRecording: boolean;
  /** True iff THIS surface owns the recorder (recording, paused, or finalizing). */
  isOwner: boolean;
  isPaused: boolean;
  isTranscribing: boolean;
  isFinalizing: boolean;
  /** Live streaming transcript for THIS surface ("" when it isn't the owner). */
  liveTranscript: string;
  /** 0–100 mic level for THIS surface (0 when it isn't the owner). */
  audioLevel: number;
  /** Elapsed seconds for THIS surface (0 when it isn't the owner). */
  durationSec: number;
  /** Begin recording here. Takes over any other in-flight recording. */
  start: () => Promise<void>;
  /** Stop recording (no-op unless this surface owns the recorder). */
  stop: () => void;
  /** Discard this surface's recording without delivering its transcript. */
  cancel: () => void;
  /** Toggle record/stop for this surface. */
  toggle: () => void;
  pause: () => void;
  resume: () => void;
  /** False when no provider is mounted (recording unavailable on this route). */
  available: boolean;
}

export function useVoiceCapture(
  options: UseVoiceCaptureOptions = {},
): UseVoiceCaptureResult {
  const generatedId = useId();
  const instanceId = options.instanceId ?? generatedId;

  const provider = useGlobalRecordingOptional();

  // Latest callbacks/label without re-creating `start` every render.
  const optsRef = useRef(options);
  optsRef.current = options;

  // Ownership-gated reads. Each selector returns an inert value for non-owners
  // so a recording in surface A never re-renders surface B on level/duration
  // ticks. `isOwnerOf` is computed inside each selector against live state.
  const isOwner = useAppSelector((s) => {
    const c = s.recordings.context;
    return c?.kind === "field" && c.instanceId === instanceId;
  });
  const isRecording = useAppSelector((s) => {
    const c = s.recordings.context;
    const owner = c?.kind === "field" && c.instanceId === instanceId;
    return owner && s.recordings.isRecording;
  });
  const liveTranscript = useAppSelector((s) => {
    const c = s.recordings.context;
    const owner = c?.kind === "field" && c.instanceId === instanceId;
    return owner ? s.recordings.liveTranscript : "";
  });
  const audioLevel = useAppSelector((s) => {
    const c = s.recordings.context;
    const owner = c?.kind === "field" && c.instanceId === instanceId;
    return owner ? s.recordings.audioLevel : 0;
  });
  const durationSec = useAppSelector((s) => {
    const c = s.recordings.context;
    const owner = c?.kind === "field" && c.instanceId === instanceId;
    return owner ? s.recordings.durationSec : 0;
  });
  const isPaused = useAppSelector((s) => isOwner && s.recordings.isPaused);
  const isTranscribing = useAppSelector(
    (s) => isOwner && s.recordings.isTranscribing,
  );

  const isAnyRecording = useAppSelector((s) => s.recordings.isRecording);
  const isFinalizing = isOwner && (provider?.isFinalizing ?? false);

  const start = useCallback(async (): Promise<void> => {
    if (!provider) {
      optsRef.current.onError?.(
        "Voice recording is unavailable on this screen.",
        "NO_PROVIDER",
      );
      return;
    }
    await provider.start({
      context: { kind: "field", instanceId, label: optsRef.current.label },
      onComplete: (result) => {
        optsRef.current.onTranscript?.(result.text ?? "", result);
      },
      onError: (message, code) => {
        optsRef.current.onError?.(message, code);
      },
    });
  }, [provider, instanceId]);

  // Stop / pause / resume must NEVER touch a recording this surface doesn't own
  // — otherwise one field's button would stop another field's recording.
  const stop = useCallback(() => {
    if (isOwner) provider?.stop();
  }, [isOwner, provider]);

  // Discard this surface's recording without delivering its transcript.
  const cancel = useCallback(() => {
    if (isOwner) provider?.cancel();
  }, [isOwner, provider]);

  const pause = useCallback(() => {
    if (isOwner) provider?.pause();
  }, [isOwner, provider]);

  const resume = useCallback(() => {
    if (isOwner) provider?.resume();
  }, [isOwner, provider]);

  const toggle = useCallback(() => {
    if (isRecording) {
      provider?.stop();
    } else {
      void start();
    }
  }, [isRecording, provider, start]);

  return {
    isRecording,
    isAnyRecording,
    isOwner,
    isPaused,
    isTranscribing,
    isFinalizing,
    liveTranscript,
    audioLevel,
    durationSec,
    start,
    stop,
    cancel,
    toggle,
    pause,
    resume,
    available: provider !== null,
  };
}

export type { GlobalRecordingApi };
