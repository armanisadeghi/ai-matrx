"use client";

// features/war-room/components/tile/TileAudioTab.tsx
//
// Audio view: the REAL transcription-cleanup pipeline, embedded. Record →
// chunked/crash-safe transcribe → auto-clean → the clean version appears
// immediately, all on the tile's own studio_sessions row (source='war_room',
// invisible to the Studio list) linked via ctx_war_room_tile_audio_sessions.
//
// The TILE owns session lifecycle (the compact "N/M" switcher + "New Session").
// CleanupPad is bound to the active session via `sessionId` and rendered
// chrome-free (variant="embedded", urlSync=false). Sidebar, dictionary, and
// custom panes are hidden here — Expand opens the full transcript studio for
// the same session. Hiding the sidebar also removes its ActiveContextButton,
// so the embedded pad can never mutate the global active context (War Room
// carries its own context).

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

export function TileAudioTab({ tileId }: { tileId: string }) {
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

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Session chrome — the tile owns lifecycle; the pad binds to the active one. */}
      <div className="flex shrink-0 items-center gap-1.5 border-b border-border/60 px-2 py-1.5">
        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
          <Radio className="size-3.5 text-primary" />
          Audio
        </span>

        {sessionIds.length > 1 ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="ml-auto inline-flex h-7 items-center gap-1 rounded-md px-2 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                title="Switch recording session"
              >
                {activeIndex >= 0 ? activeIndex + 1 : "—"}/{sessionIds.length}
                <ChevronDown className="size-3 opacity-60" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40">
              {sessionIds.map((sid, i) => (
                <DropdownMenuItem
                  key={sid}
                  onClick={() =>
                    dispatch(setTileActiveAudioSession(tileId, sid))
                  }
                  className={cn(sid === sessionId && "text-primary")}
                >
                  <Radio className="size-3.5" />
                  Recording {i + 1}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}

        <button
          type="button"
          onClick={() => void dispatch(addAudioSessionToTile(tileId))}
          className={cn(
            "inline-flex h-7 items-center gap-1 rounded-md px-2 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
            sessionIds.length > 1 ? "" : "ml-auto",
          )}
          title="Start a new recording session in this tile"
        >
          <Plus className="size-3.5" />
          New Session
        </button>
      </div>

      {/* The real pipeline, bound to the tile's active session. */}
      <div className="min-h-0 flex-1">
        {sessionId ? (
          <CleanupPad
            key={sessionId}
            sessionId={sessionId}
            urlSync={false}
            variant="embedded"
            showNewSession={false}
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
