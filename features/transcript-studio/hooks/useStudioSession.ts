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
  cleanRecordingThunk,
  deleteRecordingSegmentThunk,
  finalizeRecordingSegmentThunk,
  ingestRawChunkThunk,
  persistRecordingSafetyIdThunk,
  startRecordingSegmentThunk,
  startSessionRecordingThunk,
  stopSessionRecordingThunk,
  uploadRecordingAudioThunk,
} from "../redux/thunks";
import { selectRawSegmentsForRecording } from "../redux/selectors";
import { recordingKept } from "../redux/slice";

// A start→immediate-stop produces a near-silent clip that Whisper almost always
// hallucinates as "Thank you" / "you" etc. Discard a recording when it's both
// very short AND has negligible transcript, so we never create an empty card or
// fire a pointless cleaning pass. Tuned to keep genuine short notes (a 2s "call
// Bob back" survives on text length even though it's brief).
const MIN_KEEP_DURATION_MS = 1500;
const MIN_KEEP_TEXT_CHARS = 12;

interface UseStudioSessionOptions {
  sessionId: string | null;
}

interface UseStudioSessionReturn {
  /** True iff THIS session currently owns the global recorder. */
  isOwnedRecording: boolean;
  /** True iff some recording is in flight, not necessarily this session. */
  isAnyRecording: boolean;
  /** True while the just-stopped recording is still saving its transcript/audio. */
  isFinalizing: boolean;
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
        // Persist the crash-safe IndexedDB id the FIRST time we learn it, so a
        // recording stranded before finalize (reload / crash / bad network)
        // still points at its audio for recovery (KNOWN_DEFECTS D7).
        if (
          info.safetyId &&
          info.safetyId !== safetyIdRef.current &&
          recordingSegmentIdRef.current
        ) {
          void dispatch(
            persistRecordingSafetyIdThunk({
              sessionId,
              recordingSegmentId: recordingSegmentIdRef.current,
              safetyId: info.safetyId,
            }),
          );
        }
        safetyIdRef.current = info.safetyId || safetyIdRef.current;
        if (info.tEnd > lastTEndRef.current) lastTEndRef.current = info.tEnd;
        // Store each chunk as a raw segment AS IT TRANSCRIBES. This is the
        // reliable path — the same stream the live preview already proves works.
        // (We do NOT defer the stored transcript to a second whole-file
        // transcription on stop: that extra upload+transcribe round-trip can
        // fail and drop the ENTIRE transcript, which is exactly what happened.)
        if (!info.text.trim()) return;
        void dispatch(
          ingestRawChunkThunk({
            sessionId,
            info,
            recordingSegmentId: recordingSegmentIdRef.current,
          }),
        );
      },
      onComplete: (_result, audioBlob) => {
        const recordingSegmentId = recordingSegmentIdRef.current;
        if (!recordingSegmentId) {
          recordingSegmentIdRef.current = null;
          safetyIdRef.current = null;
          return;
        }
        const capturedSafetyId = safetyIdRef.current;
        // Discard guard: a too-short clip with negligible transcript is almost
        // always silence Whisper hallucinated into "Thank you".
        const rawText = selectRawSegmentsForRecording(
          sessionId,
          recordingSegmentId,
        )(store.getState())
          .map((r) => r.text)
          .join(" ")
          .trim();
        // The card duration is the recording's tEnd. Prefer the recorder's
        // WALL-CLOCK duration (always correct) over the last chunk's tEnd, which
        // the per-chunk timing can under-report — the "0:07 for a 0:40 clip" bug.
        const wallClockSec =
          store.getState().recordings.durationSec || lastTEndRef.current;
        // Discard ONLY a genuinely tiny clip (sub-1.5s AND ~no text) — silence
        // Whisper hallucinates into "Thank you". CRITICAL: do NOT discard just
        // because rawText is momentarily empty. The per-chunk ingests are async,
        // so the LAST chunk's raw segment may not be in Redux yet at stop; a real
        // (long) recording must NEVER be dropped on that race — its segments land
        // a beat later. Keeping the recording also keeps its audio either way.
        const tooShort =
          wallClockSec * 1000 < MIN_KEEP_DURATION_MS &&
          rawText.length < MIN_KEEP_TEXT_CHARS;
        if (tooShort) {
          void dispatch(
            deleteRecordingSegmentThunk({ sessionId, recordingSegmentId }),
          );
          toast("Discarded — recording was too short to keep.", {
            closeButton: true,
          });
          recordingSegmentIdRef.current = null;
          safetyIdRef.current = null;
          return;
        }
        // Kept — signal the UI so it can offer the "send to agent" follow-up.
        dispatch(recordingKept());
        // Finalize instantly (card leaves "processing") with the correct
        // duration, then clean THIS recording. Audio uploads in the background.
        void dispatch(
          finalizeRecordingSegmentThunk({
            sessionId,
            recordingSegmentId,
            tEnd: wallClockSec,
          }),
        ).finally(() => {
          void dispatch(
            cleanRecordingThunk({
              sessionId,
              recordingSegmentId,
              triggerCause: "session-stop",
            }),
          );
        });
        void dispatch(
          uploadRecordingAudioThunk({
            sessionId,
            recordingSegmentId,
            audioBlob: audioBlob ?? null,
            safetyId: capturedSafetyId,
          }),
        );
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
      isFinalizing: recording.isFinalizing,
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
      recording.isFinalizing,
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
