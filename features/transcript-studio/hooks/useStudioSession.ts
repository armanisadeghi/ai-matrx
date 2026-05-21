"use client";

/**
 * useStudioSession
 *
 * Bridges the GlobalRecordingProvider <-> the transcript-studio Redux state
 * for a specific session. Owns the start/stop lifecycle and the per-chunk
 * `onChunkComplete` -> `ingestRawChunkThunk` plumbing.
 *
 * Single global recording at a time (enforced by GlobalRecordingProvider).
 * If another session or feature already holds the recorder, `start()`
 * surfaces a toast error and short-circuits.
 */

import { useCallback, useMemo, useRef } from "react";
import { toast } from "sonner";
import { useAppDispatch, useAppSelector, useAppStore } from "@/lib/redux/hooks";
import {
  useGlobalRecording,
  type StartRecordingArgs,
} from "@/providers/GlobalRecordingProvider";
import {
  finalizeRecordingSegmentThunk,
  ingestRawChunkThunk,
  runCleaningPassThunk,
  startRecordingSegmentThunk,
  startSessionRecordingThunk,
  stopSessionRecordingThunk,
} from "../redux/thunks";

interface UseStudioSessionOptions {
  sessionId: string | null;
}

interface UseStudioSessionReturn {
  /** True iff THIS session currently owns the global recorder. */
  isOwnedRecording: boolean;
  /** True iff some recording is in flight, not necessarily this session. */
  isAnyRecording: boolean;
  isPaused: boolean;
  audioLevel: number;
  durationSec: number;
  start: () => Promise<void>;
  stop: () => void;
  pause: () => void;
  resume: () => void;
  /** Detail of why a start failed, surfaced via toast. */
  lastError: string | null;
}

export function useStudioSession({
  sessionId,
}: UseStudioSessionOptions): UseStudioSessionReturn {
  const dispatch = useAppDispatch();
  const store = useAppStore();
  const recording = useGlobalRecording();

  const recordings = useAppSelector((s) => s.recordings);

  // Per-cycle refs. Set on start (before any chunk fires), read in the chunk +
  // completion callbacks, which are captured at start time.
  const recordingSegmentIdRef = useRef<string | null>(null);
  const safetyIdRef = useRef<string | null>(null);
  const lastTEndRef = useRef<number>(0);

  const isOwnedRecording =
    recordings.isRecording &&
    recordings.context?.kind === "studio" &&
    recordings.context.sessionId === sessionId;
  const isAnyRecording = recordings.isRecording;

  const start = useCallback(async () => {
    if (!sessionId) return;
    if (recordings.isRecording) {
      const ownedByThis =
        recordings.context?.kind === "studio" &&
        recordings.context.sessionId === sessionId;
      toast.error(
        ownedByThis
          ? "Already recording this session."
          : "Another recording is in progress. Stop it first.",
      );
      return;
    }
    // Mark the session row as recording immediately for responsive UI.
    void dispatch(startSessionRecordingThunk({ id: sessionId }));

    // Open a new recording cycle (one card) BEFORE the recorder starts so the
    // segment id is available to stamp every chunk.
    recordingSegmentIdRef.current = null;
    safetyIdRef.current = null;
    lastTEndRef.current = 0;
    const existing =
      store.getState().transcriptStudio.recordingSegmentIdsBySession[
        sessionId
      ] ?? [];
    try {
      const segment = await dispatch(
        startRecordingSegmentThunk({
          sessionId,
          segmentIndex: existing.length,
          tStart: 0,
        }),
      ).unwrap();
      recordingSegmentIdRef.current = segment.id;
    } catch {
      // Segment row failed — recording can still proceed; chunks just won't be
      // grouped into a card. Surfaced via the thunk's own toast.
    }

    const args: StartRecordingArgs = {
      context: { kind: "studio", sessionId },
      onChunkComplete: (info) => {
        safetyIdRef.current = info.safetyId || safetyIdRef.current;
        if (info.tEnd > lastTEndRef.current) lastTEndRef.current = info.tEnd;
        if (!info.text.trim()) return;
        void dispatch(
          ingestRawChunkThunk({
            sessionId,
            info,
            recordingSegmentId: recordingSegmentIdRef.current,
          }),
        );
      },
      onComplete: () => {
        const recordingSegmentId = recordingSegmentIdRef.current;
        if (recordingSegmentId) {
          void dispatch(
            finalizeRecordingSegmentThunk({
              sessionId,
              recordingSegmentId,
              safetyId: safetyIdRef.current,
              tEnd: lastTEndRef.current,
            }),
          ).finally(() => {
            // Auto-clean this cycle once its raw chunks have landed.
            void dispatch(
              runCleaningPassThunk({ sessionId, triggerCause: "session-stop" }),
            );
          });
        }
        recordingSegmentIdRef.current = null;
        safetyIdRef.current = null;
      },
      onError: (msg) => {
        toast.error(msg);
      },
    };
    try {
      await recording.start(args);
    } catch {
      // recording.start already surfaced via onError; nothing to do.
    }
  }, [
    sessionId,
    recording,
    dispatch,
    store,
    recordings.isRecording,
    recordings.context,
  ]);

  const stop = useCallback(() => {
    if (!sessionId) return;
    if (!isOwnedRecording) return;
    const totalDurationMs = Math.round((recordings.durationSec ?? 0) * 1000);
    // Triggers the recorder's completion path, which fires `onComplete` above
    // (finalize audio + cleanup). Audio is already in IndexedDB, so nothing is
    // lost even if the upload in onComplete fails.
    recording.stop();
    void dispatch(
      stopSessionRecordingThunk({ id: sessionId, totalDurationMs }),
    );
  }, [
    sessionId,
    isOwnedRecording,
    recording,
    recordings.durationSec,
    dispatch,
  ]);

  const pause = useCallback(() => {
    if (!isOwnedRecording) return;
    recording.pause();
  }, [isOwnedRecording, recording]);

  const resume = useCallback(() => {
    if (!isOwnedRecording) return;
    recording.resume();
  }, [isOwnedRecording, recording]);

  return useMemo(
    () => ({
      isOwnedRecording,
      isAnyRecording,
      isPaused: recordings.isPaused,
      audioLevel: recordings.audioLevel,
      durationSec: recordings.durationSec,
      start,
      stop,
      pause,
      resume,
      lastError: recordings.lastError,
    }),
    [
      isOwnedRecording,
      isAnyRecording,
      recordings.isPaused,
      recordings.audioLevel,
      recordings.durationSec,
      recordings.lastError,
      start,
      stop,
      pause,
      resume,
    ],
  );
}
