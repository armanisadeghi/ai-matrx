"use client";

/**
 * Note drawer body — fully editable, full height. Mounts the canonical
 * Redux-wired `NoteContentEditor` (self-persists). No header — the drawer title
 * bar shows the note label (reported via `setTitle`); the folder + open link
 * live in `NoteFooter`.
 */

import { useEffect } from "react";
import Link from "next/link";
import { Folder, ExternalLink } from "lucide-react";
import { NoteContentEditor } from "@/features/notes/components/NoteContentEditor";
import { NoteViewControls } from "@/features/notes/components/NoteViewControls";
import { NotesInstanceProvider } from "@/features/notes/context/NotesInstanceContext";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectNoteById } from "@/features/notes/redux/selectors";
import {
  addInstanceTab,
  registerInstance,
  setInstanceActiveTab,
} from "@/features/notes/redux/slice";
import { fetchNoteContent } from "@/features/notes/redux/thunks";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { ContextItemBodyProps } from "../types";

function notesDrawerInstanceId(noteId: string): string {
  return `ctx-drawer:${noteId}`;
}

/** Register the drawer-local notes instance so view-mode controls work. */
function useNotesDrawerInstance(noteId: string | null) {
  const dispatch = useAppDispatch();

  useEffect(() => {
    if (!noteId) return;
    const instanceId = notesDrawerInstanceId(noteId);
    dispatch(registerInstance(instanceId));
    dispatch(addInstanceTab({ instanceId, noteId }));
    dispatch(setInstanceActiveTab({ instanceId, noteId }));
  }, [dispatch, noteId]);
}

export function NoteTitleActions({ item }: ContextItemBodyProps) {
  const noteId = item.refs.noteIds?.[0] ?? null;
  useNotesDrawerInstance(noteId);
  if (!noteId) return null;
  return <NoteViewControls instanceId={notesDrawerInstanceId(noteId)} />;
}

export function NoteBody({ item, setTitle }: ContextItemBodyProps) {
  const dispatch = useAppDispatch();
  const noteId = item.refs.noteIds?.[0] ?? null;
  useNotesDrawerInstance(noteId);
  const note = useAppSelector((s) =>
    noteId ? selectNoteById(noteId)(s) : undefined,
  );

  useEffect(() => {
    if (!noteId) return;
    void dispatch(fetchNoteContent(noteId));
  }, [dispatch, noteId]);

  useEffect(() => {
    if (note?.label?.trim()) setTitle?.(note.label.trim());
  }, [note?.label, setTitle]);

  if (!noteId) {
    return (
      <p className="p-4 text-xs text-muted-foreground italic">
        No note reference on this item.
      </p>
    );
  }

  return (
    <NotesInstanceProvider value={notesDrawerInstanceId(noteId)}>
      <div className="h-full min-h-0">
        <NoteContentEditor noteId={noteId} />
      </div>
    </NotesInstanceProvider>
  );
}

export function NoteFooter({ item }: ContextItemBodyProps) {
  const noteId = item.refs.noteIds?.[0] ?? null;
  const note = useAppSelector((s) =>
    noteId ? selectNoteById(noteId)(s) : undefined,
  );
  if (!noteId) return null;

  return (
    <>
      {note?.folder_name && (
        <span className="inline-flex min-w-0 items-center gap-1 text-[11px] text-muted-foreground">
          <Folder className="h-3 w-3 shrink-0" />
          <span className="truncate">{note.folder_name}</span>
        </span>
      )}
      <Tooltip>
        <TooltipTrigger asChild>
          <Link
            href={`/notes/${noteId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-auto inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </Link>
        </TooltipTrigger>
        <TooltipContent>Open note in new tab</TooltipContent>
      </Tooltip>
    </>
  );
}
