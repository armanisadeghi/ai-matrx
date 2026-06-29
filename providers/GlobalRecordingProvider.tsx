"use client";

/**
 * GlobalRecordingProvider
 *
 * Top-level provider mounted in app/Providers.tsx so a recording started
 * anywhere in the app survives every route navigation, window mount, and
 * StrictMode double-render. The provider:
 *
 *   - Owns a single `useChunkedRecordAndTranscribe` instance for the whole app.
 *   - Mirrors all observable state (`isRecording`, `audioLevel`, etc.) into
 *     `state.recordings` so non-React consumers and devtools can read it.
 *   - Forwards per-chunk timing payloads to the active subscriber via a stable
 *     ref-based callback (`onChunkComplete`), so subscribers can change without
 *     re-creating the recorder.
 *   - Enforces "at most one recording at a time" — `start()` rejects if a
 *     recording is already in flight.
 *
 * Consumers wire up via `useGlobalRecording()`. The studio session view will
 * call `start({ context: { kind: 'studio', sessionId } })` and pass an
 * `onChunkComplete` to ingest raw segments. Voice-pad keeps using the hook
 * directly for now — it's a single instance so wiring it through this
 * provider is unnecessary churn.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  useChunkedRecordAndTranscribe,
  type ChunkCompleteInfo,
} from "@/features/audio/hooks/useChunkedRecordAndTranscribe";
import type { TranscriptionResult } from "@/features/audio/types";
import { claimCapture, releaseCapture } from "@/features/audio/captureLock";
import { beginRecordingSession } from "@/features/audio/session/audioSessionRegistry";
import type { PlaybackSessionHandle } from "@/features/audio/session/types";
import { useAppDispatch } from "@/lib/redux/hooks";
import {
  audioLevelChanged,
  durationTicked,
  failedChunkCountChanged,
  liveTranscriptUpdated,
  recordingErrored,
  recordingFinalized,
  recordingPaused,
  recordingResumed,
  recordingStarted,
  recordingStopped,
  transcribingChanged,
  type RecordingContext,
} from "@/lib/redux/slices/recordingsSlice";

export interface StartRecordingArgs {
  context: RecordingContext;
  /** Per-chunk timing + text. Fires for every successful chunk transcription. */
  onChunkComplete?: (info: ChunkCompleteInfo) => void;
  /** Final accumulated text + status when the recording stops. */
  onComplete?: (result: TranscriptionResult, audioBlob?: Blob | null) => void;
  /** Failed chunk index + error message (transcription failures, not capture failures). */
  onChunkError?: (chunkIndex: number, error: string) => void;
  /** Capture-level errors — e.g. permission denied. */
  onError?: (message: string, code?: string) => void;
}

export interface GlobalRecordingApi {
  /** True iff a recording is currently active (recording or paused). */
  isActive: boolean;
  /**
   * True between `stop()` and the moment the final transcript/finalize callback
   * fires. A new recording MUST NOT start during this window — the recorder is a
   * single shared instance and starting again would reset the refs the pending
   * finalization depends on, stranding the previous recording forever.
   */
  isFinalizing: boolean;
  /** Active recording context, or null when idle. */
  context: RecordingContext | null;
  start: (args: StartRecordingArgs) => Promise<void>;
  stop: () => void;
  /**
   * Discard the active recording: stops capture and finalizes the audio safely
   * (no IndexedDB orphan) but does NOT deliver the transcript to the
   * subscriber. Used by "cancel" affordances so a cancelled recording never
   * leaks text into the host field.
   */
  cancel: () => void;
  pause: () => void;
  resume: () => void;
}

const GlobalRecordingContext = createContext<GlobalRecordingApi | null>(null);

/**
 * Stable id under which the entire global transcription session holds the
 * app-wide capture lock. The session manages global↔global takeover internally,
 * so it presents as ONE holder to the lock; a raw recorder (voice message,
 * flashcard) claiming the lock stops this session, and vice-versa.
 */
const GLOBAL_CAPTURE_ID = "global-recording-session";

/** Human label for the Audio panel's recording row, derived from context. */
function recordingSessionLabel(ctx: RecordingContext): string {
  if ("label" in ctx && ctx.label) return ctx.label;
  switch (ctx.kind) {
    case "studio":
      return "Studio recording";
    case "voice-pad":
      return "Voice pad";
    case "field":
      return "Voice input";
    default:
      return "Recording";
  }
}

interface GlobalRecordingProviderProps {
  children: ReactNode;
}

export function GlobalRecordingProvider({
  children,
}: GlobalRecordingProviderProps) {
  const dispatch = useAppDispatch();

  const contextRef = useRef<RecordingContext | null>(null);
  // The current recording's session in the unified audio registry (so the Audio
  // panel sees every recording, live + in history). Ended on finalize/error.
  const recordingSessionRef = useRef<PlaybackSessionHandle | null>(null);
  // True from stop() until the final transcript/finalize callback fires (or the
  // recorder errors). Gates `start()` so a back-to-back recording can't stomp
  // the single shared recorder while the prior recording is still finalizing.
  const [isFinalizing, setIsFinalizing] = useState(false);
  const chunkSubRef = useRef<StartRecordingArgs["onChunkComplete"]>(undefined);
  const completeSubRef = useRef<StartRecordingArgs["onComplete"]>(undefined);
  const chunkErrorSubRef =
    useRef<StartRecordingArgs["onChunkError"]>(undefined);
  const errorSubRef = useRef<StartRecordingArgs["onError"]>(undefined);
  // Set by cancel() so the imminent finalize discards the transcript instead of
  // delivering it to the subscriber.
  const cancelledRef = useRef(false);
  // Latest stop() — the app-wide capture lock calls this when another recorder
  // (raw voice message, flashcard) takes over, so capture is never concurrent.
  const stopRef = useRef<() => void>(() => {});
  // True while a takeover from start() is queued — guards the finalize-time
  // capture-lock release so an internal global→global handoff never releases
  // the lock the incoming recording is about to (re)claim.
  const pendingStartRef = useRef<StartRecordingArgs | null>(null);

  /** Release the capture lock once a recording truly ends — but not when a
   *  global→global takeover is queued (the next recording keeps the lock). */
  const releaseGlobalCaptureIfIdle = useCallback(() => {
    if (!pendingStartRef.current) releaseCapture(GLOBAL_CAPTURE_ID);
  }, []);

  const recorder = useChunkedRecordAndTranscribe({
    onChunkComplete: (info) => {
      chunkSubRef.current?.(info);
    },
    onTranscriptionComplete: (result, audioBlob) => {
      // Final state lands AFTER recordingStopped. Mirror final transcript,
      // then clear the slice context so a follow-up recording starts clean.
      dispatch(transcribingChanged(false));
      const cancelled = cancelledRef.current;
      cancelledRef.current = false;
      if (cancelled) {
        // Discard: drop any partial preview and never deliver to the subscriber.
        dispatch(liveTranscriptUpdated(""));
      } else {
        if (result.text) dispatch(liveTranscriptUpdated(result.text));
        completeSubRef.current?.(result, audioBlob);
      }
      dispatch(recordingFinalized());
      recordingSessionRef.current?.end("done");
      recordingSessionRef.current = null;
      contextRef.current = null;
      chunkSubRef.current = undefined;
      completeSubRef.current = undefined;
      chunkErrorSubRef.current = undefined;
      errorSubRef.current = undefined;
      setIsFinalizing(false);
      // Recording fully done — drop the capture lock unless a takeover is queued.
      releaseGlobalCaptureIfIdle();
    },
    onChunkError: (chunkIndex, error) => {
      chunkErrorSubRef.current?.(chunkIndex, error);
    },
    onError: (message, code) => {
      dispatch(recordingErrored(message));
      recordingSessionRef.current?.end("error", message);
      recordingSessionRef.current = null;
      cancelledRef.current = false;
      errorSubRef.current?.(message, code);
      contextRef.current = null;
      chunkSubRef.current = undefined;
      completeSubRef.current = undefined;
      chunkErrorSubRef.current = undefined;
      errorSubRef.current = undefined;
      setIsFinalizing(false);
      releaseGlobalCaptureIfIdle();
    },
  });

  // Mirror live transcript / level / duration / failedChunkCount into Redux.
  // Done here (provider scope) so consumers reading from the slice never need
  // to subscribe to the hook directly.
  useEffect(() => {
    dispatch(liveTranscriptUpdated(recorder.liveTranscript));
  }, [dispatch, recorder.liveTranscript]);
  useEffect(() => {
    dispatch(audioLevelChanged(recorder.audioLevel));
  }, [dispatch, recorder.audioLevel]);
  useEffect(() => {
    dispatch(durationTicked(recorder.duration));
  }, [dispatch, recorder.duration]);
  useEffect(() => {
    dispatch(transcribingChanged(recorder.isTranscribing));
  }, [dispatch, recorder.isTranscribing]);
  useEffect(() => {
    dispatch(failedChunkCountChanged(recorder.failedChunkCount));
  }, [dispatch, recorder.failedChunkCount]);

  // (`pendingStartRef` is declared above — it doubles as the capture-lock
  // release guard. The newest queued start-request waiting for an in-flight
  // recording to finish finalizing; start-always-wins keeps only the LATEST, so
  // a rapid A→B→C just records C.)

  // The actual "begin a fresh recording" — wires the per-recording callbacks,
  // marks the slice started, and kicks the shared recorder. Used both for an
  // immediate start (recorder idle) and for a queued takeover once the previous
  // recording has finished finalizing.
  const beginRecording = useCallback(
    async (args: StartRecordingArgs): Promise<void> => {
      // Claim the app-wide capture lock (start-always-wins). If a raw recorder
      // (voice message, flashcard) is capturing, this stops it first so two
      // captures can never overlap. Re-claiming with the same id on an internal
      // global→global takeover is a no-op handoff.
      claimCapture({
        id: GLOBAL_CAPTURE_ID,
        label: "Transcription session",
        stop: () => stopRef.current(),
      });
      contextRef.current = args.context;
      chunkSubRef.current = args.onChunkComplete;
      completeSubRef.current = args.onComplete;
      chunkErrorSubRef.current = args.onChunkError;
      errorSubRef.current = args.onError;
      dispatch(
        recordingStarted({
          context: args.context,
          startedAtMs: Date.now(),
        }),
      );
      // Surface this recording in the unified Audio panel (live → history).
      recordingSessionRef.current = beginRecordingSession({
        label: recordingSessionLabel(args.context),
        controls: { stop: () => stopRef.current() },
      });
      await recorder.startRecording();
    },
    [dispatch, recorder],
  );

  const finalizeSafetyRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stop = useCallback(() => {
    if (!recorder.isRecording) return;
    setIsFinalizing(true);
    // Safety net: the finalize callback clears `isFinalizing`, but if it never
    // fires (unexpected) the gate must not wedge recording shut forever. The
    // chunk fetch is bounded, so finalization should always complete well
    // within this window; reconcile heals any DB row that slipped through.
    if (finalizeSafetyRef.current) clearTimeout(finalizeSafetyRef.current);
    finalizeSafetyRef.current = setTimeout(() => {
      setIsFinalizing(false);
    }, 45_000);
    dispatch(recordingStopped());
    // Capture is over → move the panel session to history now (transcription
    // continues in the background; the mic is no longer live).
    recordingSessionRef.current?.end("done");
    recordingSessionRef.current = null;
    recorder.stopRecording();
  }, [dispatch, recorder]);
  // Keep the capture-lock takeover handle pointed at the latest stop().
  stopRef.current = stop;

  const start = useCallback(
    async (args: StartRecordingArgs): Promise<void> => {
      // START-ALWAYS-WINS. There is exactly one shared recorder, so two
      // recordings can never run at once. A new request never errors with
      // "busy" — instead it TAKES OVER:
      //   • If a recording is live, stop it (its transcript/audio finalize
      //     safely in the background — nothing is stranded because the shared
      //     refs aren't reset until that recording's finalize completes) and
      //     queue this request; the flush effect below begins it the moment the
      //     previous one is done finalizing.
      //   • If a previous recording is still finalizing, just queue this one.
      //   • Otherwise begin immediately.
      // NOTE: with the single shared recorder there is a brief (~1 chunk)
      // finalize gap between takeovers. A zero-gap instant handoff would require
      // detaching the finalizer from the recorder instance — tracked as a
      // follow-up; this keeps the never-lose-audio guarantee intact.
      if (recorder.isRecording) {
        pendingStartRef.current = args;
        stop();
        return;
      }
      if (isFinalizing || recorder.isTranscribing) {
        pendingStartRef.current = args;
        return;
      }
      await beginRecording(args);
    },
    [
      recorder.isRecording,
      recorder.isTranscribing,
      isFinalizing,
      stop,
      beginRecording,
    ],
  );

  // Flush a queued takeover once the previous recording is fully done: not
  // recording, not transcribing, and past the finalize gate. This is the single
  // place a deferred start fires, so it can't race the shared recorder's refs.
  useEffect(() => {
    if (
      pendingStartRef.current &&
      !isFinalizing &&
      !recorder.isRecording &&
      !recorder.isTranscribing
    ) {
      const next = pendingStartRef.current;
      pendingStartRef.current = null;
      void beginRecording(next);
    }
  }, [
    isFinalizing,
    recorder.isRecording,
    recorder.isTranscribing,
    beginRecording,
  ]);

  useEffect(() => {
    if (!isFinalizing && finalizeSafetyRef.current) {
      clearTimeout(finalizeSafetyRef.current);
      finalizeSafetyRef.current = null;
    }
  }, [isFinalizing]);

  const cancel = useCallback(() => {
    if (!recorder.isRecording) return;
    // Discard semantics: finalize the audio (so IndexedDB doesn't strand an
    // orphan) but flag the finalize to swallow the transcript instead of
    // delivering it. Mirrors stop()'s finalize-gate handling.
    cancelledRef.current = true;
    setIsFinalizing(true);
    if (finalizeSafetyRef.current) clearTimeout(finalizeSafetyRef.current);
    finalizeSafetyRef.current = setTimeout(() => {
      setIsFinalizing(false);
    }, 45_000);
    dispatch(recordingStopped());
    recordingSessionRef.current?.end("done");
    recordingSessionRef.current = null;
    recorder.stopRecording();
  }, [dispatch, recorder]);

  const pause = useCallback(() => {
    if (!recorder.isRecording || recorder.isPaused) return;
    recorder.pauseRecording();
    dispatch(recordingPaused());
  }, [dispatch, recorder]);

  const resume = useCallback(() => {
    if (!recorder.isRecording || !recorder.isPaused) return;
    recorder.resumeRecording();
    dispatch(recordingResumed());
  }, [dispatch, recorder]);

  const api = useMemo<GlobalRecordingApi>(
    () => ({
      isActive: recorder.isRecording,
      isFinalizing,
      context: contextRef.current,
      start,
      stop,
      cancel,
      pause,
      resume,
    }),
    [recorder.isRecording, isFinalizing, start, stop, cancel, pause, resume],
  );

  return (
    <GlobalRecordingContext.Provider value={api}>
      {children}
    </GlobalRecordingContext.Provider>
  );
}

export function useGlobalRecording(): GlobalRecordingApi {
  const ctx = useContext(GlobalRecordingContext);
  if (!ctx) {
    throw new Error(
      "useGlobalRecording must be used within <GlobalRecordingProvider>",
    );
  }
  return ctx;
}

/** Safe variant for components that may render outside the provider tree. */
export function useGlobalRecordingOptional(): GlobalRecordingApi | null {
  return useContext(GlobalRecordingContext);
}
