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
// A thread note is THE canonical note frame (`NoteWorkspace`): one top row —
// the thread-note dropdown in the title slot, then the four modes, formatting,
// tools — the editor, and the note's one bottom row. With no note yet, the
// dropdown alone (it owns "+ New Note") above the empty state.

import { useEffect, type ReactNode } from "react";
import { Loader2, Plus, StickyNote } from "lucide-react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { AssociationEntitySelect } from "@ai-matrx/associations/react";
import { NoteWorkspace } from "@/features/notes/components/NoteWorkspace";
import {
  selectActiveNoteId,
  selectContainerAssignmentsLoaded,
} from "@/features/war-room/redux/selectors";
import {
  addNoteToThread,
  hydrateThreadAssignments,
} from "@/features/war-room/redux/thunks";
import { useThreadNoteSelectAdapter } from "@/features/war-room/hooks/useThreadEntitySelect";

export function ThreadNotesTab({
  threadId,
  sessionId,
  leadingSlot,
  trailingSlot,
}: {
  threadId: string;
  sessionId: string;
  /** The host header's controls, folded into the note's one top row. */
  leadingSlot?: ReactNode;
  trailingSlot?: ReactNode;
  /** Kept for callers; the canonical frame fits both the full and the compact tile. */
  compact?: boolean;
}) {
  const dispatch = useAppDispatch();
  const noteId = useAppSelector(selectActiveNoteId(threadId));
  const loaded = useAppSelector(
    selectContainerAssignmentsLoaded("thread", threadId),
  );
  // The canonical name dropdown: display + inline rename + switch + unlink +
  // "+ New Note" — always visible, even with a single note.
  const noteAdapter = useThreadNoteSelectAdapter(threadId, sessionId);
  const noteSelect = (
    <AssociationEntitySelect
      token="note"
      adapter={noteAdapter}
      iconClassName="text-yellow-500"
      className="min-w-0 flex-1"
    />
  );

  // Hydrate the thread's assignments — NEVER creates a note. A thread's note
  // is created exactly once at thread provisioning; a thread genuinely
  // without one gets the explicit "New Note" empty state below.
  useEffect(() => {
    void dispatch(hydrateThreadAssignments(threadId));
  }, [threadId, dispatch]);

  if (noteId) {
    return (
      <NoteWorkspace
        instanceId={`war-room-note:${threadId}`}
        noteId={noteId}
        titleSlot={noteSelect}
        leadingSlot={leadingSlot}
        trailingSlot={trailingSlot}
        className="bg-transparent"
      />
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-7 shrink-0 items-center border-b border-border/60 pl-1.5 pr-1">
        {leadingSlot}
        {noteSelect}
        {trailingSlot}
      </div>
      <div className="min-h-0 flex-1">
        {loaded ? (
          <NoNoteEmptyState threadId={threadId} sessionId={sessionId} />
        ) : (
          <div className="grid h-full place-items-center">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        )}
      </div>
    </div>
  );
}

/** Loaded-and-empty: creating a note is an EXPLICIT user action, never automatic. */
function NoNoteEmptyState({
  threadId,
  sessionId,
}: {
  threadId: string;
  sessionId: string;
}) {
  const dispatch = useAppDispatch();
  return (
    <div className="grid h-full place-items-center">
      <div className="flex flex-col items-center gap-2 text-center">
        <StickyNote className="size-5 text-muted-foreground/60" aria-hidden />
        <span className="text-xs text-muted-foreground">
          No note on this thread yet
        </span>
        <button
          type="button"
          onClick={() => void dispatch(addNoteToThread(threadId, sessionId))}
          className="inline-flex h-7 items-center gap-1 rounded-md border border-border px-2 text-xs font-medium text-foreground transition-colors hover:bg-accent"
        >
          <Plus className="size-3.5" />
          New Note
        </button>
      </div>
    </div>
  );
}
