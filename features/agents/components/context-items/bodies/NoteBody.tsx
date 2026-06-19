"use client";

/**
 * Note drawer body — fully editable. Mounts the canonical Redux-wired
 * `NoteContentEditor` (self-persists to the notes slice + DB), so the user can
 * work on the note directly inside the drawer. A header strip shows the note's
 * metadata. For an already-sent attachment, edits won't reach the agent unless
 * re-attached — the drawer footer surfaces that action.
 */

import { NoteContentEditor } from "@/features/notes/components/NoteContentEditor";
import { NotesInstanceProvider } from "@/features/notes/context/NotesInstanceContext";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectNoteById } from "@/features/notes/redux/selectors";
import { Folder, StickyNote } from "lucide-react";
import type { ContextItemBodyProps } from "../types";

export function NoteBody({ item }: ContextItemBodyProps) {
  const noteId = item.refs.noteIds?.[0] ?? null;
  const note = useAppSelector((s) =>
    noteId ? selectNoteById(noteId)(s) : undefined,
  );

  if (!noteId) {
    return (
      <p className="p-4 text-xs text-muted-foreground italic">
        No note reference on this item.
      </p>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-start gap-2 border-b border-border px-4 py-2.5">
        <StickyNote className="mt-0.5 h-4 w-4 shrink-0 text-orange-500" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-foreground">
            {note?.label?.trim() || "Untitled note"}
          </div>
          {note?.folder_name && (
            <div className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
              <Folder className="h-3 w-3" />
              <span className="truncate">{note.folder_name}</span>
            </div>
          )}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">
        <NotesInstanceProvider value={`ctx-drawer:${noteId}`}>
          <NoteContentEditor noteId={noteId} />
        </NotesInstanceProvider>
      </div>
    </div>
  );
}
