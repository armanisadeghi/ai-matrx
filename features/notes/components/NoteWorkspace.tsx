"use client";

/**
 * NoteWorkspace — ONE note with everything /notes gives that note, for a host
 * that shows a note outside the notes app's own shell (a Board tile).
 *
 * It is the /notes main column for one note, made of the same components,
 * in TWO rows of chrome and no more:
 *   - top: [title] · the mode switch (`NoteModeSwitch`) · the formatting
 *     buttons · the note's tools — outline, versions, clean-up
 *     (`NoteRecordTools`) — · mic + "…" (`NoteTabItem` standalone, actions
 *     only; its rows also join the right-click menu on the content);
 *   - bottom: the note's one row (`NoteMetadataBar`: folder, context, tags …
 *     saved · counts · copy).
 * Between them: presence and the editor (`NoteContentEditor`, which carries
 * the context menu, AI actions, find/replace, undo/redo, conflict handling,
 * and mounts the `matrx-user/notes` agent surface itself). There is no tab
 * strip: one note has no tabs. Only the app's navigation — the note sidebar
 * and the tabs of OTHER notes — is left out.
 *
 * `title`: `"inline"` (default) puts the click-to-rename title
 * (`NoteTitleField`) at the start of the top row; `"host"` leaves it out for a
 * host that already names the note in its own header (a Board tile renders
 * `NoteTitleField` there).
 *
 * The host owns the notes instance id (one per place the note is shown); this
 * component registers it with the note as its only, active tab, and removes it
 * when it goes away. The notes shortcuts (save, find, find + replace, next
 * match) listen on THIS element, never `window`, so a board with several notes
 * sends each key to the note being worked in.
 */

import { useEffect, useRef, type KeyboardEvent, type ReactNode } from "react";
import { TapTargetButtonGroup } from "@ai-matrx/design-system/tap-target";
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
import { NoteTabItem } from "./NoteTabItem";
import { NoteTitleField } from "./NoteTitleField";

export interface NoteWorkspaceProps {
  /** The notes instance this host shows the note in — unique per host. */
  instanceId: string;
  noteId: string;
  /** Where the note's title is shown — see the header comment. */
  title?: "inline" | "host";
  /**
   * Host-supplied start of the top row INSTEAD of the title field — for a host
   * whose note name is a control of its own (the War Room's thread note
   * dropdown: switch, rename, unlink, new). Wins over `title`.
   */
  titleSlot?: ReactNode;
  /**
   * Host controls at the very start / end of the SAME top row (the War Room
   * thread's back, name and tab select; its context and options) so a host
   * with its own header never stacks a second row above the note's.
   */
  leadingSlot?: ReactNode;
  trailingSlot?: ReactNode;
  className?: string;
}

export function NoteWorkspace({ instanceId, noteId, title = "inline", titleSlot, leadingSlot, trailingSlot, className }: NoteWorkspaceProps) {
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
        {/* Narrow (a phone, a thin tile): the modes wrap to their own line instead of being squeezed to nothing between the name and the tools. */}
        <div className="flex min-h-10 shrink-0 flex-wrap items-center gap-x-1.5 border-b border-border/40 px-1.5 @[34rem]:h-10 @[34rem]:flex-nowrap">
          {leadingSlot}
          {titleSlot ? (
            <div className="min-w-0 max-w-[12rem] shrink">{titleSlot}</div>
          ) : null}
          {!titleSlot && title === "inline" && <NoteTitleField noteId={noteId} className="max-w-[6.5rem] shrink @[34rem]:max-w-[12rem]" />}
          {/* The four modes never reach into the tools beside them: centred while
              they fit, start-aligned and scrollable below ~18rem (a narrow tile),
              so the capsule can not overlap the outline / versions group. */}
          <div className="order-last flex w-full min-w-0 flex-none items-center justify-start overflow-x-auto @[34rem]:order-none @[34rem]:w-auto @[34rem]:flex-1 [scrollbar-width:none] @[18rem]:[justify-content:safe_center] [&::-webkit-scrollbar]:hidden">
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
          {/* Mic + "…" (share, move, duplicate, about, knowledge, export,
              delete…) — the note's own actions, no tab around them. */}
          <NoteTabItem noteId={noteId} instanceId={instanceId} standalone showTitle={false} />
          {trailingSlot}
        </div>
        <NotePresenceBanner instanceId={instanceId} />
        <div className="flex min-h-0 flex-1 flex-col">
          <NoteContentEditor noteId={noteId} embedded tabCarriesActions />
        </div>
        <NoteMetadataBar noteId={noteId} />
      </div>
    </NotesInstanceProvider>
  );
}
