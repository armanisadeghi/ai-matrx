"use client";

// features/war-room/hooks/useThreadActions.ts
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
  selectEffectiveThreadProjectId,
  selectThreadById,
  selectThreadIsPinned,
  selectThreadPickerOption,
  selectThreadTaskId,
} from "@/features/war-room/redux/selectors";
import {
  deleteThread,
  renameThread,
  toggleThreadHide,
  toggleThreadPin,
} from "@/features/war-room/redux/thunks";
import type { ThreadTab } from "@/features/war-room/types";

export interface ThreadActions {
  title: string;
  isPinned: boolean;
  activeTab: ThreadTab;
  canExpand: boolean;
  rename: (next: string) => void;
  togglePin: () => void;
  hide: () => void;
  expand: () => void;
  remove: () => Promise<void>;
}

export function useThreadActions(
  threadId: string,
  sessionId: string,
): ThreadActions | null {
  const dispatch = useAppDispatch();
  const router = useRouter();
  const tile = useAppSelector(selectThreadById(threadId));
  const flavor = useAppSelector(selectThreadPickerOption(threadId));
  const effectiveProjectId = useAppSelector(
    selectEffectiveThreadProjectId(threadId),
  );
  const audioSessionId = useAppSelector(selectActiveAudioSessionId(threadId));
  const taskId = useAppSelector(selectThreadTaskId(threadId));
  const noteId = useAppSelector(selectActiveNoteId(threadId));
  const isPinned = useAppSelector(selectThreadIsPinned(threadId));
  const openNoteInWindow = useOpenNoteInWindow();
  const openStudio = useOpenTranscriptStudioWindow();

  if (!tile) return null;

  const activeTab = (tile.active_tab as ThreadTab) ?? "task";
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
    if (ok) dispatch(deleteThread(threadId, sessionId));
  }

  return {
    title,
    isPinned,
    activeTab,
    canExpand,
    rename: (next) => dispatch(renameThread(threadId, next)),
    togglePin: () => dispatch(toggleThreadPin(threadId, !isPinned)),
    hide: () => dispatch(toggleThreadHide(threadId, true)),
    expand,
    remove,
  };
}
