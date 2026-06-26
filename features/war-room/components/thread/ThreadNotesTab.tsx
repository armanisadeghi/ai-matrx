"use client";

// features/war-room/components/thread/ThreadNotesTab.tsx
//
// Notes view backed by real `notes` records + the notes autosave middleware.
// A tile can hold MULTIPLE notes (mirror of the audio sessions): the tile owns
// lifecycle via the compact "N/M" switcher + "New Note", and the active note's
// editor renders below. The active note is the is_active 'note' assignment row
// (ctx_war_room_assignments) — read via selectActiveNoteId.
//
// Full view: one toolbar row (icon · Text / Matrx Split / Preview · + New).
// Compact ("All"): same merged toolbar; editor fills the section below.

import { useEffect } from "react";
import {
  Loader2,
  Type,
  Columns2,
  Eye,
  Plus,
  ChevronDown,
  StickyNote,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  NoteEditorCore,
  type EditorMode,
} from "@/features/notes/components/NoteEditorCore";
import {
  selectNoteById,
  selectNoteContent,
  selectNoteEditorMode,
} from "@/features/notes/redux/selectors";
import {
  setNoteEditorMode,
  updateNoteContent,
} from "@/features/notes/redux/slice";
import { fetchNoteContent } from "@/features/notes/redux/thunks";
import {
  selectActiveNoteId,
  selectNoteIdsForThread,
} from "@/features/war-room/redux/selectors";
import {
  addNoteToThread,
  ensureThreadNote,
  setThreadActiveNote,
} from "@/features/war-room/redux/thunks";
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
  const noteIds = useAppSelector(selectNoteIdsForThread(threadId));
  const activeIndex = noteId ? noteIds.indexOf(noteId) : -1;

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
          noteIds={noteIds}
          activeIndex={activeIndex}
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
        noteIds={noteIds}
        activeIndex={activeIndex}
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
  noteIds,
  activeIndex,
  compact,
}: {
  threadId: string;
  sessionId: string;
  noteId: string | null;
  noteIds: string[];
  activeIndex: number;
  compact?: boolean;
}) {
  const dispatch = useAppDispatch();
  const storedMode = useAppSelector(selectNoteEditorMode(noteId ?? ""));
  const mode = ((storedMode as EditorMode) || "plain") as EditorMode;
  // The active note's real name — shown so the user can SEE and track which note
  // is open (was hidden entirely, every note read as a generic "Notes").
  const activeLabel = useAppSelector((s) =>
    noteId ? (selectNoteById(noteId)(s)?.label?.trim() ?? "") : "",
  );

  return (
    <div className="flex h-7 shrink-0 items-center gap-1 border-b border-border/60 pl-1.5 pr-1">
      <StickyNote className="size-3.5 shrink-0 text-yellow-500" aria-hidden />
      <span
        className="max-w-[12rem] truncate pr-1 text-xs font-medium text-foreground"
        title={activeLabel || "Notes"}
      >
        {activeLabel || "Notes"}
      </span>

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

      {noteIds.length > 1 ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="inline-flex h-6 shrink-0 items-center gap-0.5 rounded-md px-1.5 text-[10px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              title="Switch note"
            >
              {activeIndex >= 0 ? activeIndex + 1 : "—"}/{noteIds.length}
              <ChevronDown className="size-3 opacity-60" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-40">
            {noteIds.map((nid, i) => (
              <NoteSwitcherItem
                key={nid}
                threadId={threadId}
                nid={nid}
                index={i}
                activeNoteId={noteId}
              />
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}

      <span className="min-w-0 flex-1" />

      <button
        type="button"
        onClick={() => void dispatch(addNoteToThread(threadId, sessionId))}
        className="inline-flex h-6 shrink-0 items-center gap-1 rounded-md px-1.5 text-[10px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        title="Create a new note in this tile"
      >
        <Plus className="size-3" />
        New
      </button>
    </div>
  );
}

/** One row in the note switcher — shows the note's real label (not a positional
 *  "Note N"), so the user can see and pick the note by name. */
function NoteSwitcherItem({
  threadId,
  nid,
  index,
  activeNoteId,
}: {
  threadId: string;
  nid: string;
  index: number;
  activeNoteId: string | null;
}) {
  const dispatch = useAppDispatch();
  const note = useAppSelector(selectNoteById(nid));
  const label = note?.label?.trim() || `Note ${index + 1}`;
  return (
    <DropdownMenuItem
      onClick={() => dispatch(setThreadActiveNote(threadId, nid))}
      className={cn("gap-2", nid === activeNoteId && "text-primary")}
    >
      <span className="truncate">{label}</span>
    </DropdownMenuItem>
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
