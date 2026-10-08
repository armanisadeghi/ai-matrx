"use client";

/**
 * Note drawer body — fully editable, full height. Mounts the canonical
 * Redux-wired `NoteContentEditor` (self-persists). No header — the drawer title
 * bar shows the note label (reported via `setTitle`); the folder + open link
 * live in `NoteFooter`.
 */

import { useEffect } from "react";
import { RichContent } from "@ai-matrx/rich-content/levels/RichContent";
import { Link } from "@ai-matrx/chat/host/navigation";
import { Folder, ExternalLink } from "lucide-react";
import { NoteContentEditor } from "@/features/notes/components/NoteContentEditor";
import { NoteViewControls } from "@/features/notes/components/NoteViewControls";
import { NotesInstanceProvider } from "@/features/notes/context/NotesInstanceContext";
import { useAppDispatch, useAppSelector } from "@ai-matrx/chat/store/hooks";
import {
  selectNoteById,
  selectNoteContentLoadStatus,
} from "@/features/notes/redux/selectors";
import { useEmbeddedNoteInstance } from "@/features/notes/hooks/useEmbeddedNoteInstance";
import { fetchNoteContent } from "@/features/notes/redux/thunks";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@ai-matrx/design-system";
import type { ContextItemBodyProps } from "@ai-matrx/chat/agents/components/context-items/types";
import { ResourceSnapshotView } from "@ai-matrx/chat/agents/components/context-items/bodies/ResourceSnapshotView";
import { ReadFailure } from "@/components/read-state/ReadFailure";

function notesDrawerInstanceId(noteId: string): string {
  return `ctx-drawer:${noteId}`;
}

/** Register the drawer-local notes instance so view-mode controls work. */
function useNotesDrawerInstance(noteId: string | null) {
  useEmbeddedNoteInstance(noteId ? notesDrawerInstanceId(noteId) : null, noteId);
}

export function NoteTitleActions({ item }: ContextItemBodyProps) {
  const noteId = item.refs.noteIds?.[0] ?? null;
  useNotesDrawerInstance(noteId);
  if (!item.editable) return null;
  if (!noteId) return null;
  return <NoteViewControls instanceId={notesDrawerInstanceId(noteId)} />;
}

export function NoteBody({ item, setTitle }: ContextItemBodyProps) {
  const dispatch = useAppDispatch();
  const noteId = item.refs.noteIds?.[0] ?? null;
  const instanceId = noteId ? notesDrawerInstanceId(noteId) : "";
  useNotesDrawerInstance(noteId);
  const snapshot = item.refs.resourceSnapshot;
  const note = useAppSelector((s) =>
    noteId ? selectNoteById(noteId)(s) : undefined,
  );
  const contentLoadStatus = useAppSelector(
    noteId ? selectNoteContentLoadStatus(noteId) : () => "idle" as const,
  );

  useEffect(() => {
    if (!noteId) return;
    void dispatch(fetchNoteContent(noteId));
  }, [dispatch, noteId]);

  useEffect(() => {
    if (note?.label?.trim()) setTitle?.(note.label.trim());
  }, [note?.label, setTitle]);

  if (snapshot) {
    return <ResourceSnapshotView snapshot={snapshot} />;
  }

  if (!noteId) {
    return (
      <p className="p-4 type-secondary text-muted-foreground italic">
        No note reference on this item.
      </p>
    );
  }

  if (!item.editable) {
    return (
      <div className="h-full min-h-0 overflow-y-auto p-4">
        {contentLoadStatus === "error" && !note?.content?.trim() ? (
          <ReadFailure
            error
            what="this note"
            onRetry={() => void dispatch(fetchNoteContent(noteId))}
          />
        ) : note?.content?.trim() ? (
          <div className="break-words type-body leading-relaxed text-foreground"><RichContent source={note.content ?? ""} level="standard" /></div>
        ) : (
          <p className="type-secondary italic text-muted-foreground">
            {note && contentLoadStatus === "loaded" ? "This note is empty." : "Loading note…"}
          </p>
        )}
      </div>
    );
  }

  return (
    <NotesInstanceProvider value={instanceId}>
      <div className="flex h-full min-h-0 flex-col">
        <NoteContentEditor noteId={noteId} embedded />
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
        <span className="inline-flex min-w-0 items-center gap-1 type-meta text-muted-foreground">
          <Folder className="h-3 w-3 shrink-0" />
          <span className="truncate">{note.folder_name}</span>
        </span>
      )}
      <Tooltip>
        <TooltipTrigger asChild>
          <Link
            href={`/notes?active=${encodeURIComponent(noteId)}`}
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
