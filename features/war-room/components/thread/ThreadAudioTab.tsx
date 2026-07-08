"use client";

// features/war-room/components/thread/ThreadAudioTab.tsx
//
// Audio view: the REAL transcription-cleanup pipeline, embedded. Record →
// chunked/crash-safe transcribe → auto-clean → the clean version appears
// immediately, all on the tile's own studio_sessions row (source='war_room',
// invisible to the Studio list) linked via a platform.associations edge.
//
// The TILE owns session lifecycle through the canonical AssociationEntitySelect
// (real session titles, inline rename, switch, unlink, "+ New Session" with a
// name; adapter = useThreadAudioSessionSelectAdapter) — identical toolbar
// chrome to the Notes tab. CleanupPad is bound to the active session via `sessionId`
// (variant="embedded", urlSync=false), and the FULL pipeline stays one click
// away IN PLACE — never stripped: the pad's own reveal bar opens the clean
// agent, context items, dictionary + clean-up (the "Controls" drawer), the
// custom-agent slots ("Custom"), and the tile's recording-SESSION LIST (the
// "Sessions" drawer — ThreadAudioSessionList, driven by the war-room association
// store: list / switch / start a session, scoped to THIS tile). The pad's own
// PAGE-scoped session list and the GLOBAL ActiveContextButton stay hidden (the
// tile owns sessions, and War Room carries its own context, never the global).
//
// Grid / combined compact: session chrome folds into CleanupPad's single toolbar
// row (sessions · + · Controls · Custom · record · save-only) — no duplicate
// header bands eating scroll space.

import { useEffect, useMemo } from "react";
import dynamic from "next/dynamic";
import { Loader2, Mic, Plus } from "lucide-react";
// Type-only import — erased at compile time, so the heavy CleanupPad module
// stays out of the room bundle (the component itself loads via dynamic below).
import type { CleanupExternalRecording } from "@/features/transcription-cleanup/components/CleanupPad";
import {
  getRoomRecordingController,
  registerRoomRecordingView,
} from "@/features/war-room/service/roomRecordingBridge";
import { reportWarRoomError } from "@/features/war-room/utils/reportWarRoomError";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { AssociationEntitySelect } from "@/features/scopes/components/associations/AssociationEntitySelect";
import { useThreadAudioSessionSelectAdapter } from "@/features/war-room/hooks/useThreadEntitySelect";
// Code-split: CleanupPad pulls the whole transcription-cleanup graph
// (transcript-studio + agents + audio + dictionary). Loading it lazily keeps it
// out of the War Room bundle so the room hydrates fast; it loads on demand the
// first time an Audio tab is opened.
const CleanupPad = dynamic(
  () => import("@/features/transcription-cleanup/components/CleanupPad"),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="size-4 animate-spin text-muted-foreground" />
      </div>
    ),
  },
);
import {
  selectActiveAudioSessionId,
  selectContainerAssignmentsLoaded,
} from "@/features/war-room/redux/selectors";
import {
  addAudioSessionToThread,
  hydrateThreadAudio,
} from "@/features/war-room/redux/thunks";
import { ThreadAudioSessionList } from "./ThreadAudioSessionList";

function ThreadAudioSessionChrome({
  threadId,
  compact,
}: {
  threadId: string;
  compact?: boolean;
}) {
  // The canonical name dropdown owns the WHOLE session lifecycle: real titles,
  // inline rename, switch, unlink, and "+ New Session" (named) — one control,
  // identical chrome to the Notes tab (no duplicate new-session button).
  const adapter = useThreadAudioSessionSelectAdapter(threadId);

  return (
    <AssociationEntitySelect
      token="studio_session"
      adapter={adapter}
      align="start"
      emptyLabel="Audio"
      iconClassName="text-secondary"
      className={compact ? "min-w-0" : "min-w-0 flex-1"}
    />
  );
}

export function ThreadAudioTab({
  threadId,
  compact,
}: {
  threadId: string;
  compact?: boolean;
}) {
  const dispatch = useAppDispatch();
  const sessionId = useAppSelector(selectActiveAudioSessionId(threadId));
  const loaded = useAppSelector(
    selectContainerAssignmentsLoaded("thread", threadId),
  );

  // Hydrate assignments + the active session's segments — NEVER creates a
  // session. A thread's session is created exactly once at provisioning; a
  // thread genuinely without one gets the explicit "New Session" empty state.
  useEffect(() => {
    void dispatch(hydrateThreadAudio(threadId));
  }, [threadId, sessionId, dispatch]);

  const sessionChrome = (
    <ThreadAudioSessionChrome threadId={threadId} compact={compact} />
  );

  // Room-level recording ownership (D14 fence 1): hand the pad an EXTERNAL
  // controller adapting the room's RoomRecordingController (mounted in
  // WarRoomShell, registered in roomRecordingBridge). The pad becomes a VIEW —
  // start/stop/levels route through the room controller, whose session-keyed
  // ownership + room-scope finalize callbacks survive this tab unmounting.
  const externalRecording = useMemo<CleanupExternalRecording | null>(() => {
    if (!sessionId) return null;
    return {
      start: () => {
        const controller = getRoomRecordingController();
        if (!controller) {
          // LOUD: inside a war room this must never happen — the controller
          // mounts with the shell. No silent fallback to a pad-owned recorder.
          reportWarRoomError(
            "threadAudio.startRecording",
            new Error("RoomRecordingController is not mounted"),
            { toast: "Recording is unavailable — reload the room" },
          );
          return;
        }
        return controller.start({ threadId, sessionId });
      },
      stop: (mode) => {
        const controller = getRoomRecordingController();
        if (!controller) {
          reportWarRoomError(
            "threadAudio.stopRecording",
            new Error("RoomRecordingController is not mounted"),
            { toast: "Couldn't reach the recording controller" },
          );
          return;
        }
        controller.stop(mode);
      },
      registerView: (view) => registerRoomRecordingView(sessionId, view),
    };
  }, [threadId, sessionId]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      {!compact ? (
        <div className="flex h-7 shrink-0 items-center gap-1 border-b border-border/60 pl-1.5 pr-1">
          {sessionChrome}
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1 flex-col">
        {sessionId ? (
          // NO `key={sessionId}`: CleanupPad already re-binds to a changed
          // `sessionId` prop (useCleanupSession follows `opts.sessionId` via an
          // effect, re-keys its VoicePad slice on the new id, and its load-reset
          // effect re-applies the new session's content). A key would force a
          // full remount on every session switch — unnecessary churn, and it
          // would tear down the embedded record/transcribe pipeline mid-use.
          <CleanupPad
            sessionId={sessionId}
            urlSync={false}
            variant="embedded"
            showNewSession={false}
            compact={compact}
            embeddedHeaderSlot={compact ? sessionChrome : undefined}
            externalRecording={externalRecording ?? undefined}
            sessionListSlot={<ThreadAudioSessionList threadId={threadId} />}
            sections={{
              sidebar: false,
              dictionary: false,
              clean: true,
              custom: false,
            }}
          />
        ) : loaded ? (
          <div className="grid h-full place-items-center">
            <div className="flex flex-col items-center gap-2 text-center">
              <Mic className="size-5 text-muted-foreground/60" aria-hidden />
              <span className="text-xs text-muted-foreground">
                No recording session on this thread yet
              </span>
              <button
                type="button"
                onClick={() =>
                  void dispatch(addAudioSessionToThread(threadId))
                }
                className="inline-flex h-7 items-center gap-1 rounded-md border border-border px-2 text-xs font-medium text-foreground transition-colors hover:bg-accent"
              >
                <Plus className="size-3.5" />
                New Session
              </button>
            </div>
          </div>
        ) : (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
          </div>
        )}
      </div>
    </div>
  );
}
