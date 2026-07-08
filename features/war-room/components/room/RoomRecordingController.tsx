"use client";

// features/war-room/components/room/RoomRecordingController.tsx
//
// The ROOM-LEVEL media controller (D14 fence 1). Mounted once in WarRoomShell,
// renders nothing. It OWNS the active recording session for the room's tiles:
// the embedded CleanupPad in a tile's Audio tab is a VIEW over it (start / stop
// / levels), so switching the tile to another tab — which unmounts the pad —
// leaves the recording session fully intact: the app-root mic singleton keeps
// capturing (that always survived), AND the completion/persistence callbacks
// now live HERE, at room scope, instead of dying with the pad.
//
// How the pieces relate:
//   • Engine — GlobalRecordingProvider's ONE `useChunkedRecordAndTranscribe`
//     instance (app root). Its IndexedDB-first chunk persistence + interruption
//     screaming are untouched — this controller only moves session OWNERSHIP.
//   • Ownership — recordings are started with context
//     `{ kind: "studio", sessionId }` (the tile's studio_sessions id): a STABLE
//     key, unlike the pad's old per-mount field instanceId, so a remounted pad
//     re-attaches to the live recording (state via the `recordings` slice).
//   • Room state — `warRoom.audioRecording` ({threadId, sessionId, status})
//     mirrors the in-flight recording for war-room UI/selectors.
//   • Completion — routed through `roomRecordingBridge`: a mounted pad view
//     gets the transcript (full CleanupPad pipeline: queued inserts, persist,
//     auto-clean); with NO pad mounted the fallback commit below persists the
//     raw transcript + updates the pad's voicePad draft so nothing is lost and
//     the pad view is correct when the user returns.
//
// The callbacks passed to `recording.start()` are self-contained closures over
// `dispatch`/`store`/module registries — they keep working even if this
// controller (or the whole room) unmounts before finalize completes.

import { useEffect } from "react";
import { toast } from "sonner";
import {
  useGlobalRecording,
  type StartRecordingArgs,
} from "@/providers/GlobalRecordingProvider";
import { useAppDispatch, useAppStore } from "@/lib/redux/hooks";
import type { AppDispatch, RootState } from "@/lib/redux/store";
import {
  addTranscriptEntry,
  selectVoicePadDraftText,
  selectVoicePadEntries,
  setDraftText,
} from "@/lib/redux/slices/voicePadSlice";
import {
  CLEANUP_OVERLAY_ID,
  cleanupVoicePadInstanceId,
} from "@/features/transcription-cleanup/constants";
import { composeTranscriptParts } from "@/features/transcription-cleanup/utils/transcriptCompose";
import {
  insertRawSegment,
  listRawSegments,
} from "@/features/transcript-studio/service/studioService";
import { fetchRawSegmentsThunk } from "@/features/transcript-studio/redux/thunks";
import {
  roomRecordingCleared,
  roomRecordingFinalizing,
  roomRecordingStarted,
} from "@/features/war-room/redux/slice";
import {
  consumeRoomRecordingStopMode,
  getRoomRecordingView,
  registerRoomRecordingController,
  setRoomRecordingStopMode,
  type RoomRecordingStartArgs,
  type RoomRecordingStopMode,
} from "@/features/war-room/service/roomRecordingBridge";
import { reportWarRoomError } from "@/features/war-room/utils/reportWarRoomError";

/**
 * Minimal safe commit for a recording that finalized with NO pad view mounted:
 * persist the raw transcript onto the session (one 'chunk' segment, exactly as
 * CleanupPad's persistRawAppend would) and update the pad's voicePad draft so
 * the transcript is on screen the moment the user switches the tile back to
 * Audio. Auto-clean is deliberately skipped — it needs the pad's Clean agent
 * selection; the user can run Clean Up when they return.
 */
async function commitOrphanRoomRecording(args: {
  dispatch: AppDispatch;
  getState: () => RootState;
  sessionId: string;
  text: string;
}): Promise<void> {
  const { dispatch, getState, sessionId, text } = args;
  const trimmed = text.trim();
  if (!trimmed) return;

  const instanceId = cleanupVoicePadInstanceId(sessionId);
  const state = getState();
  const draft = selectVoicePadDraftText(state, CLEANUP_OVERLAY_ID, instanceId);
  const entries = selectVoicePadEntries(state, CLEANUP_OVERLAY_ID, instanceId);
  const base =
    draft !== null ? draft : entries.map((e) => e.text).join("\n\n");

  dispatch(
    addTranscriptEntry({
      overlayId: CLEANUP_OVERLAY_ID,
      instanceId,
      text: trimmed,
    }),
  );
  dispatch(
    setDraftText({
      overlayId: CLEANUP_OVERLAY_ID,
      instanceId,
      text: composeTranscriptParts(base, trimmed),
    }),
  );

  // Elapsed seconds — read before recordingFinalized clears it; falls back to 0.
  const t = Math.max(0, state.recordings.durationSec || 0);
  const existing = await listRawSegments(sessionId);
  const nextChunkIndex =
    existing.length > 0
      ? Math.max(...existing.map((s) => s.chunkIndex)) + 1
      : 0;
  await insertRawSegment({
    sessionId,
    chunkIndex: nextChunkIndex,
    tStart: t,
    tEnd: t,
    text: trimmed,
    source: "chunk",
  });
  // Refresh the studio slice so the agent context + a remounted pad see it.
  void dispatch(fetchRawSegmentsThunk({ sessionId }));
  toast.success("Recording saved to the thread's audio session");
}

export function RoomRecordingController() {
  const dispatch = useAppDispatch();
  const store = useAppStore();
  const recording = useGlobalRecording();

  useEffect(() => {
    const start = async ({
      threadId,
      sessionId,
    }: RoomRecordingStartArgs): Promise<void> => {
      // Session-keyed ownership + self-contained lifecycle callbacks. These
      // closures capture only globals (store/dispatch/registries) + this
      // recording's ids — they survive any component unmount.
      const args: StartRecordingArgs = {
        context: { kind: "studio", sessionId },
        onComplete: (result) => {
          const mode: RoomRecordingStopMode = consumeRoomRecordingStopMode();
          dispatch(roomRecordingCleared());
          const view = getRoomRecordingView(sessionId);
          if (view) {
            // Pad mounted — full pipeline (compose queued inserts, persist,
            // auto-clean for "full" stops).
            view.onComplete(result.text ?? "", mode);
            return;
          }
          void commitOrphanRoomRecording({
            dispatch,
            getState: () => store.getState(),
            sessionId,
            text: result.text ?? "",
          }).catch((err) => {
            // LOUD: the raw text failed to persist. The audio itself is still
            // safe in the recorder's IndexedDB layer (untouched by this fence).
            reportWarRoomError("roomRecording.commitOrphan", err, {
              toast:
                "Couldn't save the recording's transcript — the audio is safe; reopen the Audio tab and try again",
            });
          });
        },
        onError: (message) => {
          dispatch(roomRecordingCleared());
          reportWarRoomError("roomRecording", new Error(message), {
            toast: message,
          });
        },
      };
      setRoomRecordingStopMode("full");
      dispatch(roomRecordingStarted({ threadId, sessionId }));
      await recording.start(args);
    };

    const stop = (mode: RoomRecordingStopMode): void => {
      setRoomRecordingStopMode(mode);
      dispatch(roomRecordingFinalizing());
      recording.stop();
    };

    return registerRoomRecordingController({ start, stop });
  }, [recording, dispatch, store]);

  return null;
}
