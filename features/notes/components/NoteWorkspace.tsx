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
 * (`NoteStatsFooter`); the versions button opens the note's history as a
 * canvas tab beside it. Only the
 * app's navigation — the note sidebar and the tab strip of OTHER notes — is
 * left out.
 *
 * The host owns the notes instance id (one per place the note is shown); this
 * component registers it with the note as its only, active tab, and removes it
 * when it goes away. The notes shortcuts (save, find, find + replace, next
 * match) listen on THIS element, never `window`, so a board with several notes
 * sends each key to the note being worked in.
 */

import { useEffect, useRef, type KeyboardEvent } from "react";
import { TapTargetButtonGroup } from "@ai-matrx/tap-target";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { cn } from "@/lib/utils";
import {
  addInstanceTab,
  removeInstanceTab,
  registerInstance,
  setInstanceActiveTab,
  unregisterInstance,
} from "../redux/slice";
import {
  fetchNotesList,
  fetchSharedNotesList,
} from "../redux/thunks";
import { selectNotesListStatus } from "../redux/selectors";
import { NotesInstanceProvider } from "../context/NotesInstanceContext";
import { handleNoteShortcut } from "../utils/noteShortcuts";
import { NoteContentEditor } from "./NoteContentEditor";
import { NoteMetadataBar } from "./NoteMetadataBar";
import { NoteModeSwitch } from "./NoteModeSwitch";
import { FormatButtons } from "@ai-matrx/rich-editor/format/FormatButtons";
import { formatTargetWithin } from "@ai-matrx/rich-editor/format/format-target";
import { useNoteEditorMode } from "../hooks/usePreferredDefaultEditorMode";
import { NotePresenceBanner } from "./NotePresenceBanner";
import { NoteRecordTools } from "./NoteRecordTools";
import { NoteStatsFooter } from "./NoteStatsFooter";
import { NoteTabItem } from "./NoteTabItem";

export interface NoteWorkspaceProps {
  /** The notes instance this host shows the note in — unique per host. */
  instanceId: string;
  noteId: string;
  className?: string;
}

export function NoteWorkspace({ instanceId, noteId, className }: NoteWorkspaceProps) {
  const dispatch = useAppDispatch();
  const rootRef = useRef<HTMLDivElement>(null);
  const editorMode = useNoteEditorMode(noteId);

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
    void dispatch(fetchNotesList({ ifIdle: true }));
    void dispatch(fetchSharedNotesList());
  }, [dispatch, listStatus]);


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
        ref={rootRef}
        className={cn("@container flex h-full min-h-0 w-full min-w-0 flex-col bg-card", className)}
        onKeyDown={onKeyDown}
      >
        <div className="flex h-10 shrink-0 items-center gap-2 border-b border-border/40 px-1.5">
          {/* The four modes never reach into the tools beside them: centred while
              they fit, start-aligned and scrollable below ~18rem (a narrow tile),
              so the capsule can not overlap the outline / versions group. */}
          <div className="flex min-w-0 flex-1 items-center justify-start overflow-x-auto [scrollbar-width:none] @[18rem]:justify-center [&::-webkit-scrollbar]:hidden">
            <NoteModeSwitch noteId={noteId} labels="container" />
            {editorMode !== "preview" && (
              <FormatButtons size="xs" className="ml-1 flex-1" resolve={() => formatTargetWithin(rootRef.current)} />
            )}
          </div>
          <TapTargetButtonGroup surface="solid">
            <NoteRecordTools
              instanceId={instanceId}
              noteId={noteId}
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
    </NotesInstanceProvider>
  );
}
