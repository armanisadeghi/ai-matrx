"use client";

// features/war-room/components/thread/ThreadNotesTab.tsx
//
// Notes view backed by real `notes` records + the notes autosave middleware.
// A tile can hold MULTIPLE notes (mirror of the audio sessions): the toolbar's
// AssociationEntitySelect (the canonical name dropdown) owns the whole note
// lifecycle — shows the active note's real name, renames it inline (click),
// lists every thread note, unlinks, and creates+attaches a named new note.
// The active note is the is_active 'note' assignment edge — read via
// selectActiveNoteId; the adapter is useThreadNoteSelectAdapter.
//
// Full view: one toolbar row (note select · Text / Matrx Split / Preview).
// Compact ("All"): same merged toolbar; editor fills the section below.

import { useEffect } from "react";
import { Loader2, Type, Columns2, Eye } from "lucide-react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { AssociationEntitySelect } from "@/features/scopes/components/associations/AssociationEntitySelect";
import {
  NoteEditorCore,
  type EditorMode,
} from "@/features/notes/components/NoteEditorCore";
import {
  selectNoteContent,
  selectNoteEditorMode,
} from "@/features/notes/redux/selectors";
import {
  setNoteEditorMode,
  updateNoteContent,
} from "@/features/notes/redux/slice";
import { fetchNoteContent } from "@/features/notes/redux/thunks";
import { selectActiveNoteId } from "@/features/war-room/redux/selectors";
import { ensureThreadNote } from "@/features/war-room/redux/thunks";
import { useThreadNoteSelectAdapter } from "@/features/war-room/hooks/useThreadEntitySelect";
import { cn } from "@/lib/utils";

const MODES: { id: EditorMode; label: string; Icon: typeof Type }[] = [
  { id: "plain", label: "Text", Icon: Type },
  { id: "split", label: "Matrx Split", Icon: Columns2 },
  { id: "preview", label: "Preview", Icon: Eye },
];

export function ThreadNotesTab({
  threadId,
  sessionId,
  compact,
}: {
  threadId: string;
  sessionId: string;
  compact?: boolean;
}) {
  const dispatch = useAppDispatch();
  const noteId = useAppSelector(selectActiveNoteId(threadId));

  // Ensure the tile has a backing note so the editor always has one to bind to
  // (idempotent + coalesced inside the thunk). A fresh tile gets its first note
  // here; an existing tile resolves its active 'note' assignment.
  useEffect(() => {
    if (!noteId) void dispatch(ensureThreadNote(threadId));
  }, [noteId, threadId, dispatch]);

  // Compact ("All" combined view): merged toolbar + plain editor only.
  if (compact) {
    if (!noteId) {
      return (
        <div className="grid h-full place-items-center">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      );
    }
    return (
      <div className="flex h-full min-h-0 flex-col">
        <ThreadNotesToolbar
          threadId={threadId}
          sessionId={sessionId}
          noteId={noteId}
          compact
        />
        <div className="min-h-0 flex-1">
          <ThreadNoteEditor noteId={noteId} compact />
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ThreadNotesToolbar
        threadId={threadId}
        sessionId={sessionId}
        noteId={noteId}
      />

      <div className="min-h-0 flex-1">
        {noteId ? (
          <ThreadNoteEditor noteId={noteId} />
        ) : (
          <div className="grid h-full place-items-center">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        )}
      </div>
    </div>
  );
}

function ThreadNotesToolbar({
  threadId,
  sessionId,
  noteId,
  compact,
}: {
  threadId: string;
  sessionId: string;
  noteId: string | null;
  compact?: boolean;
}) {
  const dispatch = useAppDispatch();
  const storedMode = useAppSelector(selectNoteEditorMode(noteId ?? ""));
  const mode = ((storedMode as EditorMode) || "plain") as EditorMode;
  // The canonical name dropdown: display + inline rename + switch + unlink +
  // "+ New Note" — always visible, even with a single note.
  const noteAdapter = useThreadNoteSelectAdapter(threadId, sessionId);

  return (
    <div className="flex h-7 shrink-0 items-center gap-1 border-b border-border/60 pl-1.5 pr-1">
      <AssociationEntitySelect
        token="note"
        adapter={noteAdapter}
        iconClassName="text-yellow-500"
        className="min-w-0 flex-1"
      />

      {noteId
        ? MODES.map(({ id, label, Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() =>
                dispatch(setNoteEditorMode({ id: noteId, mode: id }))
              }
              aria-pressed={mode === id}
              title={label}
              className={cn(
                "inline-flex h-6 items-center gap-1 rounded-md px-1.5 text-[10px] font-medium transition-colors",
                mode === id
                  ? "text-primary border border-primary/70"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              <Icon className="size-3" />
              {!compact ? (
                <span className="@max-[20rem]:hidden">{label}</span>
              ) : null}
            </button>
          ))
        : null}
    </div>
  );
}

function ThreadNoteEditor({
  noteId,
  compact,
}: {
  noteId: string;
  compact?: boolean;
}) {
  const dispatch = useAppDispatch();
  const content = useAppSelector(selectNoteContent(noteId));
  const storedMode = useAppSelector(selectNoteEditorMode(noteId));
  const mode = ((storedMode as EditorMode) || "plain") as EditorMode;

  useEffect(() => {
    if (content === undefined) dispatch(fetchNoteContent(noteId));
  }, [noteId, content, dispatch]);

  const onChange = (next: string) =>
    dispatch(updateNoteContent({ id: noteId, content: next }));

  if (compact) {
    return (
      <NoteEditorCore
        content={content ?? ""}
        onChange={onChange}
        onChangeFlush={onChange}
        editorMode={mode}
        placeholder="Jot down anything for this thread…"
        showVoiceButton={false}
        embedded
        className="h-full"
      />
    );
  }

  return (
    <NoteEditorCore
      content={content ?? ""}
      onChange={onChange}
      onChangeFlush={onChange}
      editorMode={mode}
      showVoiceButton
      embedded
      placeholder="Jot down anything for this thread…"
      className="h-full"
    />
  );
}
