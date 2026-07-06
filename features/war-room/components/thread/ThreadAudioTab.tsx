"use client";

// features/war-room/components/thread/ThreadAudioTab.tsx
//
// Audio view: the REAL transcription-cleanup pipeline, embedded. Record →
// chunked/crash-safe transcribe → auto-clean → the clean version appears
// immediately, all on the tile's own studio_sessions row (source='war_room',
// invisible to the Studio list) linked via a platform.associations edge.
//
// The TILE owns session lifecycle through the canonical AssociationEntitySelect
// (real session titles, inline rename, switch, unlink, "+ New" with a name;
// adapter = useThreadAudioSessionSelectAdapter) plus a one-click "New Session"
// button. CleanupPad is bound to the active session via `sessionId`
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

import { useEffect } from "react";
import dynamic from "next/dynamic";
import { Plus, Loader2 } from "lucide-react";
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
import { selectActiveAudioSessionId } from "@/features/war-room/redux/selectors";
import {
  addAudioSessionToThread,
  ensureThreadAudioSession,
} from "@/features/war-room/redux/thunks";
import { ThreadAudioSessionList } from "./ThreadAudioSessionList";

function ThreadAudioSessionChrome({
  threadId,
  compact,
}: {
  threadId: string;
  compact?: boolean;
}) {
  const dispatch = useAppDispatch();
  // The canonical name dropdown: real session titles, inline rename, switch,
  // unlink, "+ New" with a name. The plus button stays as the one-click
  // "start recording now" path (default-named session).
  const adapter = useThreadAudioSessionSelectAdapter(threadId);

  if (compact) {
    return (
      <>
        <AssociationEntitySelect
          token="studio_session"
          adapter={adapter}
          align="start"
          emptyLabel="Audio"
          className="min-w-0"
        />
        <button
          type="button"
          onClick={() => void dispatch(addAudioSessionToThread(threadId))}
          className="grid size-6 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          title="Start a new recording session in this tile"
          aria-label="New recording session"
        >
          <Plus className="size-3.5" />
        </button>
      </>
    );
  }

  return (
    <>
      <AssociationEntitySelect
        token="studio_session"
        adapter={adapter}
        align="start"
        emptyLabel="Audio"
        className="min-w-0 flex-1"
      />

      <button
        type="button"
        onClick={() => void dispatch(addAudioSessionToThread(threadId))}
        className="inline-flex h-7 shrink-0 items-center gap-1 rounded-md px-2 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        title="Start a new recording session in this tile"
      >
        <Plus className="size-3.5" />
        New Session
      </button>
    </>
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

  // Ensure the tile has a backing audio session so the embedded pad always has
  // one to bind to (idempotent + coalesced inside the thunk). A fresh tile gets
  // its first session here; recording into it persists via the pad's own writer.
  useEffect(() => {
    if (!sessionId) void dispatch(ensureThreadAudioSession(threadId));
  }, [sessionId, threadId, dispatch]);

  const sessionChrome = (
    <ThreadAudioSessionChrome threadId={threadId} compact={compact} />
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      {!compact ? (
        <div className="flex shrink-0 items-center gap-1.5 border-b border-border/60 px-2 py-1.5">
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
            sessionListSlot={<ThreadAudioSessionList threadId={threadId} />}
            sections={{
              sidebar: false,
              dictionary: false,
              clean: true,
              custom: false,
            }}
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
          </div>
        )}
      </div>
    </div>
  );
}
