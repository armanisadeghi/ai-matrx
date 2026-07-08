// features/war-room/service/roomRecordingBridge.ts
//
// Module-scoped registry connecting the ROOM-LEVEL recording controller
// (`RoomRecordingController`, mounted once in `WarRoomShell`) to the tile-level
// recording VIEW (the embedded `CleanupPad` in a tile's Audio tab). This is the
// D14 fence: the controller — not the pad — owns the active recording session,
// so switching a tile's tab (which unmounts the pad) never tears the recording
// down; the remounted pad re-attaches through this bridge + the recordings
// slice (ownership is keyed by the studio session id, not a component mount).
//
// Same module-registry pattern as `war-room-tools/binding-registry.ts` and
// `threadFileRagCache.ts` — an imperative handle that must be reachable from
// any pad instance regardless of where it sits in the React tree (grid tile,
// stage, combined view). Observable STATE lives in Redux (`warRoom.audioRecording`
// + the global `recordings` slice); only the imperative verbs live here.
//
// At most one recording exists app-wide (GlobalRecordingProvider), so the
// single-slot controller registry + stop-mode latch are safe by construction.

/** How a stop was requested — routes the finalized transcript. */
export type RoomRecordingStopMode = "full" | "transcript-only";

export interface RoomRecordingStartArgs {
  threadId: string;
  /** The tile's `studio_sessions` row to record into. */
  sessionId: string;
}

/** Imperative API registered by the mounted RoomRecordingController. */
export interface RoomRecordingControllerApi {
  start(args: RoomRecordingStartArgs): Promise<void>;
  stop(mode: RoomRecordingStopMode): void;
}

/**
 * A mounted pad view for one studio session. When present at finalize time the
 * controller hands the transcript to it (full CleanupPad pipeline: compose
 * queued inserts, persist, auto-clean); when absent the controller runs the
 * minimal safe commit itself so dictation is NEVER lost.
 */
export interface RoomRecordingView {
  onComplete(text: string, mode: RoomRecordingStopMode): void;
}

let controller: RoomRecordingControllerApi | null = null;
const viewsBySession = new Map<string, RoomRecordingView>();
let stopMode: RoomRecordingStopMode = "full";

/** Register the room controller. Returns an unregister that only clears itself. */
export function registerRoomRecordingController(
  api: RoomRecordingControllerApi,
): () => void {
  controller = api;
  return () => {
    if (controller === api) controller = null;
  };
}

export function getRoomRecordingController(): RoomRecordingControllerApi | null {
  return controller;
}

/** Register a pad view for a session. Returns an unregister that only clears itself. */
export function registerRoomRecordingView(
  sessionId: string,
  view: RoomRecordingView,
): () => void {
  viewsBySession.set(sessionId, view);
  return () => {
    if (viewsBySession.get(sessionId) === view) {
      viewsBySession.delete(sessionId);
    }
  };
}

export function getRoomRecordingView(
  sessionId: string,
): RoomRecordingView | null {
  return viewsBySession.get(sessionId) ?? null;
}

/** Latch the stop mode for the recording about to finalize. */
export function setRoomRecordingStopMode(mode: RoomRecordingStopMode): void {
  stopMode = mode;
}

/** Read + reset the latched stop mode (defaults back to "full"). */
export function consumeRoomRecordingStopMode(): RoomRecordingStopMode {
  const mode = stopMode;
  stopMode = "full";
  return mode;
}
