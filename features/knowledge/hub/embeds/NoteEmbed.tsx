"use client";

/**
 * The Note embed: the note editor /notes uses (`NoteContentEditor`, in its own
 * notes instance) in the hub's peek, opened to READ with an Edit switch. The
 * switch never grants more than the person has — a viewer-level sharee's
 * editor stays read-only and the switch says so.
 */

import { useEffect, useState } from "react";
import { Pencil } from "lucide-react";
import { useAppDispatch } from "@/lib/redux/hooks";
import { Switch } from "@/components/ui/switch";
import { NoteContentEditor } from "@/features/notes/components/NoteContentEditor";
import { NotesInstanceProvider } from "@/features/notes/context/NotesInstanceContext";
import { useEmbeddedNoteInstance } from "@/features/notes/hooks/useEmbeddedNoteInstance";
import { useNoteAccess } from "@/features/notes/hooks/useNoteAccess";
import { fetchNoteContent } from "@/features/notes/redux/thunks";

export function NoteEmbed({ noteId }: { noteId: string }) {
  const dispatch = useAppDispatch();
  const instanceId = `knowledge-peek:${noteId}`;
  useEmbeddedNoteInstance(instanceId, noteId);
  useEffect(() => {
    void dispatch(fetchNoteContent(noteId));
  }, [dispatch, noteId]);
  const access = useNoteAccess(noteId);
  const [editing, setEditing] = useState(false);
  const canEdit = !access.loading && !access.readOnly;
  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="hub-embed-note">
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-4 py-1.5 text-xs">
        <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
        <label htmlFor={`${instanceId}-edit`} className="font-medium">
          Edit
        </label>
        <Switch
          id={`${instanceId}-edit`}
          checked={editing && canEdit}
          disabled={!canEdit}
          onCheckedChange={setEditing}
          aria-label="Edit this note"
        />
        <span className="text-muted-foreground">
          {access.loading
            ? "Checking whether you can edit…"
            : access.readOnly
              ? "You can read this note; its owner has not given you edit access."
              : editing
                ? "Editing — changes save as you type."
                : "Reading."}
        </span>
      </div>
      <NotesInstanceProvider value={instanceId}>
        <div className="flex min-h-0 flex-1 flex-col">
          <NoteContentEditor noteId={noteId} embedded forceReadOnly={!(editing && canEdit)} />
        </div>
      </NotesInstanceProvider>
    </div>
  );
}
