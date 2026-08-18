"use client";

// features/vision-interview/hooks/useTurnAudioAttachment.ts
//
// The association half of raw-audio capture (v2 §13.1): the human's turn row
// is created SERVER-side when a send/start is accepted, so the audio's
// cld_files id (already durably uploaded by the canonical recorder,
// independent of any agent call — v2 §17.1 ordering) must be stamped onto
// that turn AFTER it lands via realtime/refetch. Robust to timing in both
// directions:
//   - turn lands first, upload finishes later → the late `dictationAudioSaved`
//     joins the awaiting set (slice) and this effect stamps on the next pass;
//   - upload lands first, turn arrives later → the effect fires when the turn
//     merges into the store.
// The stamp write is guarded server-side (`audio_file_id IS NULL`), so a
// duplicate pass or a second client can never clobber an association.

import { useEffect, useRef } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { captureError } from "@/lib/diagnostics/errorCaptureStore";
import { attachTurnAudio } from "../service";
import {
  selectAwaitingTurnAudio,
  selectTurnsOrdered,
  turnAudioSettled,
  turnMerged,
} from "../redux/vision-interview.slice";

/** Clock-skew tolerance between this device and the DB's created_at. */
const SKEW_MS = 120_000;
/** After this long with no matching turn, stop waiting (the audio itself is
 *  safe regardless — it lives in cld_files + the Expert's Recordings). */
const GIVE_UP_MS = 5 * 60_000;

export function useTurnAudioAttachment(sessionId: string) {
  const dispatch = useAppDispatch();
  const awaiting = useAppSelector(selectAwaitingTurnAudio);
  const turns = useAppSelector(selectTurnsOrdered);
  const busyRef = useRef(false);

  useEffect(() => {
    if (!awaiting || busyRef.current) return;
    const age = Date.now() - awaiting.sentAtMs;

    if (awaiting.fileIds.length === 0) {
      // Marker-only send (nothing dictated); expire it once no late upload
      // can plausibly still belong to it.
      if (age > GIVE_UP_MS) dispatch(turnAudioSettled());
      return;
    }

    // The newest human turn created for this send that carries no audio yet.
    const candidate = [...turns]
      .reverse()
      .find(
        (t) =>
          t.speaker === "human" &&
          t.audio_file_id === null &&
          Date.parse(t.created_at) >= awaiting.sentAtMs - SKEW_MS,
      );

    if (!candidate) {
      if (age > GIVE_UP_MS) dispatch(turnAudioSettled());
      return;
    }

    // One turn row, one audio_file_id column: with several dictations in one
    // message, the LAST recording is stamped; every recording is durably
    // saved (and origin-attributed) in the transcripts system regardless.
    const fileId = awaiting.fileIds[awaiting.fileIds.length - 1];
    busyRef.current = true;
    void attachTurnAudio(candidate.id, fileId)
      .then((saved) => {
        if (saved) dispatch(turnMerged(saved));
        dispatch(turnAudioSettled());
      })
      .catch((err) => {
        // Loud, never silent — and never retry-storm: leave the awaiting set
        // in place so the next turn/store change retries naturally.
        captureError({
          source: "supabase-exception",
          message: `[vision-interview] could not stamp audio_file_id onto turn ${candidate.id} (session ${sessionId}): ${
            err instanceof Error ? err.message : String(err)
          }`,
          raw: { sessionId, turnId: candidate.id, fileId, err },
        });
      })
      .finally(() => {
        busyRef.current = false;
      });
  }, [awaiting, turns, dispatch, sessionId]);
}
