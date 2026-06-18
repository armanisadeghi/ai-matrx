/**
 * transcribeRecordingWholeThunk — the Scribe WHOLE-RECORDING model.
 *
 * Scribe handles each recording as ONE unit (record → stop → one audio file).
 * Instead of the Studio's per-chunk live transcription with hand-stitched
 * timing (fragile across recordings — the source of the wrong durations and the
 * "11:41" timecode jumps), Scribe transcribes the COMPLETE recording ONCE on
 * stop via `uploadAndTranscribeFull`, and stores Whisper's own per-segment
 * timestamps as the raw transcript. Those timestamps are file-relative and
 * accurate, so the audio markers resolve to the exact moment in the recording's
 * audio file. The per-chunk stream is used only for the live preview + the
 * crash-safe IndexedDB copy — it is never stored.
 *
 * Idempotent: re-running replaces this recording's raw segments. After it lands,
 * the caller runs the (recording-aligned) cleaning pass on the accurate text.
 */

import { createAsyncThunk } from "@reduxjs/toolkit";
import { toast } from "sonner";
import type { AppDispatch, RootState } from "@/lib/redux/store";
import { uploadAndTranscribeFull } from "@/features/audio/services/audioFallbackUpload";
import { audioSafetyStore } from "@/features/audio/services/audioSafetyStore";
import { getUserId } from "@/utils/auth/getUserId";
import {
  deleteRawSegment,
  insertRawSegment,
  updateRecordingSegment,
} from "../service/studioService";
import type { RawSegment } from "../types";
import { selectRawSegmentsForRecording } from "./selectors";
import {
  rawSegmentRemoved,
  rawSegmentsAppended,
  recordingSegmentUpserted,
} from "./slice";

export interface TranscribeRecordingWholeResult {
  status: "complete" | "empty" | "failed";
  segmentCount: number;
}

export const transcribeRecordingWholeThunk = createAsyncThunk<
  TranscribeRecordingWholeResult,
  {
    sessionId: string;
    recordingSegmentId: string;
    /** The complete recording blob (in-memory at stop). */
    audioBlob: Blob | null;
    /** Crash-safe IndexedDB id — used to recover the blob if the arg is empty. */
    safetyId: string | null;
    /** Wall-clock fallback when Whisper doesn't return a duration. */
    fallbackDurationSec?: number;
  },
  { state: RootState; dispatch: AppDispatch }
>(
  "transcriptStudio/transcribeRecordingWhole",
  async (
    { sessionId, recordingSegmentId, audioBlob, safetyId, fallbackDurationSec },
    { dispatch, getState },
  ) => {
    // Resolve the complete recording blob (in-memory; else the crash-safe copy).
    let blob: Blob | null = audioBlob ?? null;
    if ((!blob || blob.size === 0) && safetyId) {
      try {
        blob = await audioSafetyStore.getAudioBlob(safetyId);
      } catch {
        blob = null;
      }
    }
    if (!blob || blob.size === 0) {
      return { status: "failed", segmentCount: 0 };
    }

    const userId = getUserId() ?? "";
    const result = await uploadAndTranscribeFull(blob, userId);
    if (!result.success) {
      toast.error("Couldn't transcribe the recording — tap the card to retry.");
      return { status: "failed", segmentCount: 0 };
    }

    const whisperSegments = (result.segments ?? []).filter((s) =>
      s.text.trim(),
    );
    const durationSec = result.duration ?? fallbackDurationSec ?? 0;

    // Replace any prior raw segments for this recording (idempotent re-transcribe).
    const existing = selectRawSegmentsForRecording(
      sessionId,
      recordingSegmentId,
    )(getState());
    for (const r of existing) {
      dispatch(rawSegmentRemoved({ sessionId, segmentId: r.id }));
      try {
        await deleteRawSegment(r.id);
      } catch {
        // Best effort — a leftover row is harmless; the realtime echo reconciles.
      }
    }

    // One raw segment per Whisper segment (accurate file-relative timing). If
    // Whisper returned text but no segments, store the whole transcript as one.
    const toInsert =
      whisperSegments.length > 0
        ? whisperSegments.map((s, i) => ({
            chunkIndex: i,
            tStart: s.start,
            tEnd: s.end,
            text: s.text.trim(),
          }))
        : result.text?.trim()
          ? [{ chunkIndex: 0, tStart: 0, tEnd: durationSec, text: result.text.trim() }]
          : [];

    if (toInsert.length === 0) {
      return { status: "empty", segmentCount: 0 };
    }

    const inserted = (await Promise.all(
      toInsert.map((seg) =>
        insertRawSegment({
          sessionId,
          recordingSegmentId,
          chunkIndex: seg.chunkIndex,
          tStart: seg.tStart,
          tEnd: seg.tEnd,
          text: seg.text,
          source: "whole",
        }),
      ),
    )) as RawSegment[];
    dispatch(rawSegmentsAppended({ sessionId, segments: inserted }));

    // Stamp the recording's TRUE end from Whisper's duration — fixes the wrong
    // card duration the per-chunk stitching produced (e.g. 0:07 for a 0:40 clip).
    if (durationSec > 0) {
      try {
        const seg = await updateRecordingSegment(recordingSegmentId, {
          tEnd: durationSec,
        });
        if (seg) dispatch(recordingSegmentUpserted({ sessionId, segment: seg }));
      } catch {
        // Non-fatal — the segments still carry accurate per-segment timing.
      }
    }

    return { status: "complete", segmentCount: inserted.length };
  },
);
