"use client";

// features/war-room/hooks/useTileActions.ts
//
// One hook that resolves every action a tile can take (rename, pin, hide,
// delete, expand, switch tab) against the REAL warRoom thunks + overlay
// openers. The Stage tile, the Grid tile, and the rail row all consume it, so
// the behavior is written once and identical everywhere — no forked logic.
//
// Expand routing (parity with the canonical tile): notes → note window,
// audio / agent → transcript studio window (the agent shares the tile's studio
// session), task/combined → /tasks/[id] (or the note window when only a note
// exists).

import { useRouter } from "next/navigation";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { useOpenNoteInWindow } from "@/features/notes/actions/useOpenNoteInWindow";
import { useOpenTranscriptStudioWindow } from "@/features/overlays/openers/transcriptStudioWindow";
import {
  selectActiveAudioSessionId,
  selectActiveNoteId,
  selectEffectiveTileProjectId,
  selectTileById,
  selectTileFlavor,
  selectTileTaskId,
} from "@/features/war-room/redux/selectors";
import {
  deleteTile,
  renameTile,
  toggleTileHide,
  toggleTilePin,
} from "@/features/war-room/redux/thunks";
import type { TileTab } from "@/features/war-room/types";

export interface TileActions {
  title: string;
  isPinned: boolean;
  activeTab: TileTab;
  canExpand: boolean;
  rename: (next: string) => void;
  togglePin: () => void;
  hide: () => void;
  expand: () => void;
  remove: () => Promise<void>;
}

export function useTileActions(
  tileId: string,
  sessionId: string,
): TileActions | null {
  const dispatch = useAppDispatch();
  const router = useRouter();
  const tile = useAppSelector(selectTileById(tileId));
  const flavor = useAppSelector(selectTileFlavor(tileId));
  const effectiveProjectId = useAppSelector(
    selectEffectiveTileProjectId(tileId),
  );
  const audioSessionId = useAppSelector(selectActiveAudioSessionId(tileId));
  const taskId = useAppSelector(selectTileTaskId(tileId));
  const noteId = useAppSelector(selectActiveNoteId(tileId));
  const openNoteInWindow = useOpenNoteInWindow();
  const openStudio = useOpenTranscriptStudioWindow();

  if (!tile) return null;

  const activeTab = (tile.active_tab as TileTab) ?? "task";
  const title = tile.title?.trim() || "Untitled thread";

  const canExpand =
    (activeTab === "notes" && !!noteId) ||
    ((activeTab === "audio" || activeTab === "agent") && !!audioSessionId) ||
    ((activeTab === "task" || activeTab === "combined") &&
      (flavor === "project" && !!effectiveProjectId
        ? true
        : !!taskId || !!noteId));

  function expand() {
    if (!tile) return;
    switch (activeTab) {
      case "notes":
        if (noteId) openNoteInWindow({ noteId });
        break;
      case "audio":
      case "agent":
        // The Agent tab shares the tile's studio session, so expanding opens the
        // full Scribe studio for that same session (richer view of recordings,
        // transcripts, and the working document the agent co-edits).
        if (audioSessionId) openStudio({ activeSessionId: audioSessionId });
        break;
      case "task":
      case "combined":
        if (flavor === "project" && effectiveProjectId) {
          router.push(`/projects/${effectiveProjectId}`);
        } else if (taskId) {
          router.push(`/tasks/${taskId}`);
        } else if (noteId) {
          openNoteInWindow({ noteId });
        }
        break;
    }
  }

  async function remove() {
    const ok = await confirm({
      title: "Remove this thread?",
      description:
        "The tile leaves this War Room. Any linked task, note, or transcript stays safe in its own feature.",
      variant: "destructive",
      confirmLabel: "Remove",
    });
    if (ok) dispatch(deleteTile(tileId, sessionId));
  }

  return {
    title,
    isPinned: tile.is_pinned,
    activeTab,
    canExpand,
    rename: (next) => dispatch(renameTile(tileId, next)),
    togglePin: () => dispatch(toggleTilePin(tileId, !tile.is_pinned)),
    hide: () => dispatch(toggleTileHide(tileId, true)),
    expand,
    remove,
  };
}
