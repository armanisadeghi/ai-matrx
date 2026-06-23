"use client";

// features/war-room/components/tile/TileAudioSessionList.tsx
//
// The tile's recording-session LIST — the powerful "track every session" view
// that the embedded CleanupPad reveals in place (via its `sessionListSlot`
// prop), instead of the page-scoped CleanupSessionList. It drives the REAL
// war-room association store: the tile's `source='war_room'` studio sessions,
// tracked in the war-room slice and exposed through:
//   • selectAudioSessionIdsForTile(tileId)   — the tile's ordered session ids
//   • selectActiveAudioSessionId(tileId)      — which one is focused
//   • setTileActiveAudioSession(tileId, id)   — switch focus (persists + loads)
//   • addAudioSessionToTile(tileId)           — start a fresh session
//
// Each row enriches with the studio session row's title + relative time when
// that row is hydrated in the transcript-studio slice (it is, for any session
// the user has opened — switching loads its segments + the row); rows that are
// not yet hydrated fall back to "Recording N" by their position, matching the
// existing TileAudioSessionChrome vocabulary. No forked list, no new store.

import { AudioLines, Loader2, Plus } from "lucide-react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import type { RootState } from "@/lib/redux/store";
import { selectSessionsById } from "@/features/transcript-studio/redux/selectors";
import {
  selectActiveAudioSessionId,
  selectAudioSessionIdsForTile,
} from "@/features/war-room/redux/selectors";
import {
  addAudioSessionToTile,
  setTileActiveAudioSession,
} from "@/features/war-room/redux/thunks";
import { cn } from "@/lib/utils";
import { formatRelativeTime } from "@/utils/datetime";

export function TileAudioSessionList({ tileId }: { tileId: string }) {
  const dispatch = useAppDispatch();
  const sessionIds = useAppSelector(selectAudioSessionIdsForTile(tileId));
  const activeId = useAppSelector(selectActiveAudioSessionId(tileId));
  // Studio session rows (title / updatedAt) for any session already hydrated.
  const studioById = useAppSelector((s: RootState) => selectSessionsById(s));

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          <AudioLines className="h-3.5 w-3.5 text-primary/70" />
          Recording sessions
          <span className="rounded bg-muted px-1 py-px font-medium tabular-nums">
            {sessionIds.length}
          </span>
        </span>
        <button
          type="button"
          onClick={() => void dispatch(addAudioSessionToTile(tileId))}
          title="Start a new recording session in this thread"
          className="inline-flex h-7 items-center gap-1 rounded-md border border-primary/30 bg-card px-2 text-[11px] font-medium text-foreground ring-1 ring-primary/10 transition-all hover:ring-primary/30 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
        >
          <Plus className="h-3.5 w-3.5 text-primary" />
          New
        </button>
      </div>

      {sessionIds.length === 0 ? (
        <div className="flex flex-col items-center gap-1.5 rounded-lg border border-dashed border-border px-3 py-4 text-center">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          <span className="text-[11px] leading-relaxed text-muted-foreground">
            Preparing this thread&apos;s first recording session…
          </span>
        </div>
      ) : (
        <ul className="flex flex-col gap-0.5">
          {sessionIds.map((sid, i) => {
            const active = sid === activeId;
            const row = studioById[sid];
            const label = row?.title?.trim() || `Recording ${i + 1}`;
            const when = row?.updatedAt
              ? formatRelativeTime(row.updatedAt, { fallback: "" })
              : "";
            return (
              <li key={sid}>
                <button
                  type="button"
                  onClick={() =>
                    dispatch(setTileActiveAudioSession(tileId, sid))
                  }
                  aria-pressed={active}
                  className={cn(
                    "flex w-full flex-col items-start gap-0.5 rounded-md border-l-2 px-2 py-1.5 text-left transition-colors",
                    active
                      ? "border-primary bg-primary/10 text-foreground"
                      : "border-transparent text-foreground/90 hover:bg-accent/60",
                  )}
                >
                  <span className="w-full truncate text-xs font-medium leading-snug">
                    {label}
                  </span>
                  <span className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                    <span className="tabular-nums">#{i + 1}</span>
                    {when ? <span>{when}</span> : null}
                    {active ? (
                      <span className="rounded bg-primary/15 px-1 py-px font-medium text-primary">
                        Active
                      </span>
                    ) : null}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
