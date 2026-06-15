"use client";

// features/war-room/hooks/useTileActions.ts
//
// One hook that resolves every action a tile can take (rename, pin, hide,
// delete, expand, switch tab) against the REAL warRoom thunks + overlay
// openers. The Stage tile, the Grid tile, and the rail row all consume it, so
// the behavior is written once and identical everywhere — no forked logic.
//
// Expand routing (parity with the canonical tile): notes → note window,
// audio → transcript studio window, task/combined → /tasks/[id] (or the note
// window when only a note exists).

import { useRouter } from "next/navigation";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { useOpenNoteInWindow } from "@/features/notes/actions/useOpenNoteInWindow";
import { useOpenTranscriptStudioWindow } from "@/features/overlays/openers/transcriptStudioWindow";
import {
  selectActiveAudioSessionId,
  selectTileById,
} from "@/features/war-room/redux/selectors";
import {
  deleteTile,
  renameTile,
  setTileActiveTabPersisted,
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
  /** Restore a parked (hidden) tile back to the room. */
  unhide: () => void;
  setTab: (tab: TileTab) => void;
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
  const audioSessionId = useAppSelector(selectActiveAudioSessionId(tileId));
  const openNoteInWindow = useOpenNoteInWindow();
  const openStudio = useOpenTranscriptStudioWindow();

  if (!tile) return null;

  const activeTab = (tile.active_tab as TileTab) ?? "task";
  const title = tile.title?.trim() || "Untitled thread";

  const canExpand =
    (activeTab === "notes" && !!tile.note_id) ||
    (activeTab === "audio" && !!audioSessionId) ||
    ((activeTab === "task" || activeTab === "combined") &&
      (!!tile.task_id || !!tile.note_id));

  function expand() {
    if (!tile) return;
    switch (activeTab) {
      case "notes":
        if (tile.note_id) openNoteInWindow({ noteId: tile.note_id });
        break;
      case "audio":
        if (audioSessionId) openStudio({ activeSessionId: audioSessionId });
        break;
      case "task":
      case "combined":
        if (tile.task_id) router.push(`/tasks/${tile.task_id}`);
        else if (tile.note_id) openNoteInWindow({ noteId: tile.note_id });
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
    unhide: () => dispatch(toggleTileHide(tileId, false)),
    setTab: (tab) => dispatch(setTileActiveTabPersisted(tileId, tab)),
    expand,
    remove,
  };
}
