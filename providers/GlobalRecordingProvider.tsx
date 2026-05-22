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
  type ReactNode,
} from "react";
import {
  useChunkedRecordAndTranscribe,
  type ChunkCompleteInfo,
} from "@/features/audio/hooks/useChunkedRecordAndTranscribe";
import type { TranscriptionResult } from "@/features/audio/types";
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
  /** Active recording context, or null when idle. */
  context: RecordingContext | null;
  start: (args: StartRecordingArgs) => Promise<void>;
  stop: () => void;
  pause: () => void;
  resume: () => void;
}

const GlobalRecordingContext = createContext<GlobalRecordingApi | null>(null);

interface GlobalRecordingProviderProps {
  children: ReactNode;
}

export function GlobalRecordingProvider({
  children,
}: GlobalRecordingProviderProps) {
  const dispatch = useAppDispatch();

  const contextRef = useRef<RecordingContext | null>(null);
  const chunkSubRef = useRef<StartRecordingArgs["onChunkComplete"]>(undefined);
  const completeSubRef = useRef<StartRecordingArgs["onComplete"]>(undefined);
  const chunkErrorSubRef = useRef<StartRecordingArgs["onChunkError"]>(undefined);
  const errorSubRef = useRef<StartRecordingArgs["onError"]>(undefined);

  const recorder = useChunkedRecordAndTranscribe({
    onChunkComplete: (info) => {
      chunkSubRef.current?.(info);
    },
    onTranscriptionComplete: (result, audioBlob) => {
      // Final state lands AFTER recordingStopped. Mirror final transcript,
      // then clear the slice context so a follow-up recording starts clean.
      dispatch(transcribingChanged(false));
      if (result.text) dispatch(liveTranscriptUpdated(result.text));
      completeSubRef.current?.(result, audioBlob);
      dispatch(recordingFinalized());
      contextRef.current = null;
      chunkSubRef.current = undefined;
      completeSubRef.current = undefined;
      chunkErrorSubRef.current = undefined;
      errorSubRef.current = undefined;
    },
    onChunkError: (chunkIndex, error) => {
      chunkErrorSubRef.current?.(chunkIndex, error);
    },
    onError: (message, code) => {
      dispatch(recordingErrored(message));
      errorSubRef.current?.(message, code);
      contextRef.current = null;
      chunkSubRef.current = undefined;
      completeSubRef.current = undefined;
      chunkErrorSubRef.current = undefined;
      errorSubRef.current = undefined;
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

  const start = useCallback(
    async (args: StartRecordingArgs): Promise<void> => {
      if (recorder.isRecording) {
        const message =
          "A recording is already in progress. Stop it before starting a new one.";
        args.onError?.(message);
        throw new Error(message);
      }
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
      await recorder.startRecording();
    },
    [dispatch, recorder],
  );

  const stop = useCallback(() => {
    if (!recorder.isRecording) return;
    dispatch(recordingStopped());
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
      context: contextRef.current,
      start,
      stop,
      pause,
      resume,
    }),
    [recorder.isRecording, start, stop, pause, resume],
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
