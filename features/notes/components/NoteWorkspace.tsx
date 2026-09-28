"use client";

/**
 * NoteWorkspace — ONE note with everything /notes gives that note, for a host
 * that shows a note outside the notes app's own shell (a Board tile).
 *
 * It is the /notes main column for one note, made of the same components:
 * the mode switch (`NoteModeSwitch`), the note's tools — outline, versions,
 * clean-up (`NoteRecordTools`) — presence, the editor (`NoteContentEditor`,
 * which carries the toolbar, context menu, AI actions, find/replace,
 * undo/redo, conflict handling, the mic and "…" menu, and mounts the
 * `matrx-user/notes` agent surface itself), the note's chip (`NoteTabItem`,
 * standalone: title rename, mic, the "…" menu), the metadata bar (folder,
 * context, tags — `NoteMetadataBar`), the save/stats strip
 * (`NoteStatsFooter`) and version history (`NoteVersionHistory`). Only the
 * app's navigation — the note sidebar and the tab strip of OTHER notes — is
 * left out.
 *
 * The host owns the notes instance id (one per place the note is shown); this
 * component registers it with the note as its only, active tab, and removes it
 * when it goes away. The notes shortcuts (save, find, find + replace, next
 * match) listen on THIS element, never `window`, so a board with several notes
 * sends each key to the note being worked in.
 */

import { useEffect, type KeyboardEvent } from "react";
import dynamic from "next/dynamic";
import { TapTargetButtonGroup } from "@ai-matrx/tap-target";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { cn } from "@/lib/utils";
import {
  addInstanceTab,
  removeInstanceTab,
  registerInstance,
  setInstanceActiveTab,
  setInstanceHistoryOpen,
  unregisterInstance,
} from "../redux/slice";
import {
  fetchNotesList,
  fetchSharedNotesList,
  refetchNoteContent,
} from "../redux/thunks";
import {
  selectInstanceHistoryOpen,
  selectNotesListStatus,
} from "../redux/selectors";
import { NotesInstanceProvider } from "../context/NotesInstanceContext";
import { handleNoteShortcut } from "../utils/noteShortcuts";
import { NoteContentEditor } from "./NoteContentEditor";
import { NoteMetadataBar } from "./NoteMetadataBar";
import { NoteModeSwitch } from "./NoteModeSwitch";
import { NotePresenceBanner } from "./NotePresenceBanner";
import { NoteRecordTools } from "./NoteRecordTools";
import { NoteStatsFooter } from "./NoteStatsFooter";
import { NoteTabItem } from "./NoteTabItem";
const NoteVersionHistory = dynamic(
  () => import("./NoteVersionHistory").then((mod) => ({ default: mod.NoteVersionHistory })),
  { ssr: false },
);

export interface NoteWorkspaceProps {
  /** The notes instance this host shows the note in — unique per host. */
  instanceId: string;
  noteId: string;
  className?: string;
}

export function NoteWorkspace({ instanceId, noteId, className }: NoteWorkspaceProps) {
  const dispatch = useAppDispatch();

  // The instance holds this note as its only, active tab — what the editor,
  // find/replace, outline and presence read.
  useEffect(() => {
    dispatch(registerInstance(instanceId));
    return () => {
      dispatch(unregisterInstance(instanceId));
    };
  }, [dispatch, instanceId]);
  useEffect(() => {
    dispatch(addInstanceTab({ instanceId, noteId }));
    dispatch(setInstanceActiveTab({ instanceId, noteId }));
    return () => {
      dispatch(removeInstanceTab({ instanceId, noteId }));
    };
  }, [dispatch, instanceId, noteId]);

  // The folder menu lists the person's folders, which come from the notes
  // list — load it once if nothing on screen has yet (/notes does on mount).
  const listStatus = useAppSelector(selectNotesListStatus);
  useEffect(() => {
    if (listStatus !== "idle") return;
    void dispatch(fetchNotesList());
    void dispatch(fetchSharedNotesList());
  }, [dispatch, listStatus]);

  const historyOpen = useAppSelector(selectInstanceHistoryOpen(instanceId));
  const setHistoryOpen = (open: boolean) =>
    dispatch(setInstanceHistoryOpen({ instanceId, open }));

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (
      handleNoteShortcut(e, {
        dispatch,
        instanceId,
        activeTabId: noteId,
        canCloseTab: false,
      })
    ) {
      e.stopPropagation();
    }
  };

  return (
    <NotesInstanceProvider value={instanceId}>
      <div
        className={cn("@container flex h-full min-h-0 w-full min-w-0 flex-col bg-card", className)}
        onKeyDown={onKeyDown}
      >
        <div className="flex h-10 shrink-0 items-center gap-1 border-b border-border/40 px-1">
          <div className="flex min-w-0 flex-1 items-center justify-center">
            <NoteModeSwitch noteId={noteId} labels="container" />
          </div>
          <TapTargetButtonGroup className="shrink-0">
            <NoteRecordTools
              instanceId={instanceId}
              noteId={noteId}
              historyOpen={historyOpen}
              onToggleHistory={() => setHistoryOpen(!historyOpen)}
            />
          </TapTargetButtonGroup>
        </div>
        {/* The note's own chip, exactly as /notes shows its active tab: the
            title (click to rename), the mic and the "…" menu (share, move,
            duplicate, about, knowledge, export, delete…), whose rows also
            join the right-click menu on the content. Standalone: there is no
            other tab, so no close. */}
        <div className="flex h-8 min-h-8 shrink-0 items-stretch overflow-hidden border-b border-border">
          <div className="flex min-w-0 max-w-full items-stretch">
            <NoteTabItem noteId={noteId} instanceId={instanceId} standalone />
          </div>
        </div>
        <NotePresenceBanner instanceId={instanceId} />
        <div className="flex min-h-0 flex-1 flex-col">
          <NoteContentEditor noteId={noteId} embedded tabCarriesActions />
        </div>
        <NoteMetadataBar noteId={noteId} />
        <NoteStatsFooter noteId={noteId} standalone />
      </div>
      {historyOpen ? (
        <NoteVersionHistory
          noteId={noteId}
          open={historyOpen}
          onOpenChange={setHistoryOpen}
          onVersionRestored={() => void dispatch(refetchNoteContent(noteId))}
        />
      ) : null}
    </NotesInstanceProvider>
  );
}
