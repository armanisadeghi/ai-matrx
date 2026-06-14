"use client";

// features/war-room/components/room/WarRoomShell.tsx
//
// Top-level frame for one War Room session: header (back + title) + the tile
// gallery. Wave 1 hydrates the session and renders a placeholder body; Wave 2
// fills in <WarRoomGallery/>.

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2, LayoutGrid } from "lucide-react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  selectSessionById,
  selectTilesStatusForSession,
} from "@/features/war-room/redux/selectors";
import {
  leaveWarRoomSession,
  loadWarRoomSession,
} from "@/features/war-room/redux/thunks";
import { WarRoomGallery } from "./WarRoomGallery";

export function WarRoomShell({ sessionId }: { sessionId: string }) {
  const dispatch = useAppDispatch();
  const router = useRouter();
  const session = useAppSelector(selectSessionById(sessionId));
  const tilesStatus = useAppSelector(selectTilesStatusForSession(sessionId));

  useEffect(() => {
    dispatch(loadWarRoomSession(sessionId));
    return () => {
      dispatch(leaveWarRoomSession(sessionId));
    };
  }, [sessionId, dispatch]);

  const loading = tilesStatus === "loading" || tilesStatus === "idle";
  const notFound = tilesStatus === "error" && !session;

  return (
    <div className="h-[calc(100vh-2.5rem)] flex flex-col overflow-hidden bg-textured">
      {/* Header — pr-14 clears the shell's fixed top-right avatar. */}
      <header className="shrink-0 border-b border-border pl-2 pr-14 py-2 flex items-center gap-2">
        <button
          type="button"
          onClick={() => router.back()}
          className="grid place-items-center size-8 rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
          aria-label="Back"
        >
          <ArrowLeft className="size-4.5" />
        </button>
        <span className="grid place-items-center size-7 rounded-md bg-primary/10 text-primary shrink-0">
          <LayoutGrid className="size-4" />
        </span>
        <h1 className="text-sm font-semibold text-foreground truncate">
          {session?.title ?? "War Room"}
        </h1>
      </header>

      {/* Body */}
      <div className="flex-1 overflow-hidden">
        {loading ? (
          <div className="h-full grid place-items-center">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        ) : notFound ? (
          <div className="h-full grid place-items-center text-center px-4">
            <div>
              <p className="text-sm font-medium text-foreground">
                War Room not found
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                It may have been deleted.
              </p>
            </div>
          </div>
        ) : (
          <WarRoomGallery sessionId={sessionId} />
        )}
      </div>
    </div>
  );
}
