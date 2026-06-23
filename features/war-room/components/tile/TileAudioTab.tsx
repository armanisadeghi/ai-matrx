"use client";

// features/war-room/components/tile/TileAudioTab.tsx
//
// Audio view: the REAL transcription-cleanup pipeline, embedded. Record →
// chunked/crash-safe transcribe → auto-clean → the clean version appears
// immediately, all on the tile's own studio_sessions row (source='war_room',
// invisible to the Studio list) linked via ctx_war_room_tile_audio_sessions.
//
// The TILE owns session lifecycle (the always-visible session switcher +
// "New Session"). CleanupPad is bound to the active session via `sessionId`
// (variant="embedded", urlSync=false), and the FULL pipeline stays one click
// away IN PLACE — never stripped: the pad's own reveal bar opens the clean
// agent, context items, dictionary + clean-up (the "Controls" drawer) and the
// custom-agent slots ("Custom"). The only things hidden in embedded are the
// pad's PAGE-scoped session list + the GLOBAL ActiveContextButton (the tile
// owns sessions, and War Room carries its own context, never the global one).
//
// Grid / combined compact: session chrome folds into CleanupPad's single toolbar
// row (sessions · + · Controls · Custom · record · save-only) — no duplicate
// header bands eating scroll space.

import { useEffect } from "react";
import dynamic from "next/dynamic";
import { Plus, ChevronDown, Radio, Loader2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
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
  selectAudioSessionIdsForTile,
} from "@/features/war-room/redux/selectors";
import {
  addAudioSessionToTile,
  ensureTileAudioSession,
  setTileActiveAudioSession,
} from "@/features/war-room/redux/thunks";
import { cn } from "@/lib/utils";

function TileAudioSessionChrome({
  tileId,
  compact,
  sessionId,
  sessionIds,
  activeIndex,
}: {
  tileId: string;
  compact?: boolean;
  sessionId: string | null;
  sessionIds: string[];
  activeIndex: number;
}) {
  const dispatch = useAppDispatch();

  if (compact) {
    return (
      <>
        {sessionIds.length >= 1 ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="inline-flex h-6 shrink-0 items-center gap-0.5 rounded-md px-1.5 text-[10px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                title="This thread's recording sessions"
              >
                {activeIndex >= 0 ? activeIndex + 1 : "—"}/{sessionIds.length}
                <ChevronDown className="size-3 opacity-60" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-40">
              {sessionIds.map((sid, i) => (
                <DropdownMenuItem
                  key={sid}
                  onClick={() =>
                    dispatch(setTileActiveAudioSession(tileId, sid))
                  }
                  className={cn("gap-2", sid === sessionId && "text-primary")}
                >
                  Recording {i + 1}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
        <button
          type="button"
          onClick={() => void dispatch(addAudioSessionToTile(tileId))}
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
      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
        <Radio className="size-3.5 text-muted-foreground" />
        Audio
      </span>

      {sessionIds.length >= 1 ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="ml-auto inline-flex h-7 items-center gap-1 rounded-md px-2 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              title="This thread's recording sessions"
            >
              <Radio className="size-3 opacity-70" />
              Session {activeIndex >= 0 ? activeIndex + 1 : "—"}/
              {sessionIds.length}
              <ChevronDown className="size-3 opacity-60" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            {sessionIds.map((sid, i) => (
              <DropdownMenuItem
                key={sid}
                onClick={() => dispatch(setTileActiveAudioSession(tileId, sid))}
                className={cn("gap-2", sid === sessionId && "text-primary")}
              >
                <Radio className="size-3.5 shrink-0" />
                Recording {i + 1}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
        <span className="ml-auto" />
      )}

      <button
        type="button"
        onClick={() => void dispatch(addAudioSessionToTile(tileId))}
        className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        title="Start a new recording session in this tile"
      >
        <Plus className="size-3.5" />
        New Session
      </button>
    </>
  );
}

export function TileAudioTab({
  tileId,
  compact,
}: {
  tileId: string;
  compact?: boolean;
}) {
  const dispatch = useAppDispatch();
  const sessionId = useAppSelector(selectActiveAudioSessionId(tileId));
  const sessionIds = useAppSelector(selectAudioSessionIdsForTile(tileId));
  const activeIndex = sessionId ? sessionIds.indexOf(sessionId) : -1;

  // Ensure the tile has a backing audio session so the embedded pad always has
  // one to bind to (idempotent + coalesced inside the thunk). A fresh tile gets
  // its first session here; recording into it persists via the pad's own writer.
  useEffect(() => {
    if (!sessionId) void dispatch(ensureTileAudioSession(tileId));
  }, [sessionId, tileId, dispatch]);

  const sessionChrome = (
    <TileAudioSessionChrome
      tileId={tileId}
      compact={compact}
      sessionId={sessionId}
      sessionIds={sessionIds}
      activeIndex={activeIndex}
    />
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
