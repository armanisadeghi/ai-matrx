"use client";

// features/war-room/components/tile/TileNotesTab.tsx
//
// Notes view backed by real `notes` records + the notes autosave middleware.
// A tile can hold MULTIPLE notes (mirror of the audio sessions): the tile owns
// lifecycle via the compact "N/M" switcher + "New Note", and the active note's
// editor renders below. The active note also lives on tile.note_id so note↔task
// sync keeps working.
//
// Full view (Notes tab) offers Text / Matrx Split / Preview modes via the
// canonical NoteEditorCore. Compact view (the "All" tab) is a single open
// editor that fills its section — no double layering, switcher chrome omitted.

import { useEffect } from "react";
import { Loader2, Type, Columns2, Eye, Plus, ChevronDown, StickyNote } from "lucide-react";
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
  selectNoteIdsForTile,
} from "@/features/war-room/redux/selectors";
import {
  addNoteToTile,
  ensureTileNote,
  setTileActiveNote,
} from "@/features/war-room/redux/thunks";
import { cn } from "@/lib/utils";

const MODES: { id: EditorMode; label: string; Icon: typeof Type }[] = [
  { id: "plain", label: "Text", Icon: Type },
  { id: "split", label: "Matrx Split", Icon: Columns2 },
  { id: "preview", label: "Preview", Icon: Eye },
];

export function TileNotesTab({
  tileId,
  sessionId,
  compact,
}: {
  tileId: string;
  sessionId: string;
  compact?: boolean;
}) {
  const dispatch = useAppDispatch();
  const noteId = useAppSelector(selectActiveNoteId(tileId));
  const noteIds = useAppSelector(selectNoteIdsForTile(tileId));
  const activeIndex = noteId ? noteIds.indexOf(noteId) : -1;

  // Ensure the tile has a backing note so the editor always has one to bind to
  // (idempotent + coalesced inside the thunk). A fresh tile gets its first note
  // here; an existing tile resolves its backfilled note_id.
  useEffect(() => {
    if (!noteId) void dispatch(ensureTileNote(tileId));
  }, [noteId, tileId, dispatch]);

  // Compact ("All" combined view): single open editor, no switcher chrome.
  if (compact) {
    if (!noteId) {
      return (
        <div className="grid h-full place-items-center">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      );
    }
    return <TileNoteEditor noteId={noteId} compact />;
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Session chrome — the tile owns lifecycle; the editor binds the active note. */}
      <div className="flex shrink-0 items-center gap-1.5 border-b border-border/60 px-2 py-1.5">
        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
          <StickyNote className="size-3.5 text-primary" />
          Notes
        </span>

        {noteIds.length > 1 ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="ml-auto inline-flex h-7 items-center gap-1 rounded-md px-2 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                title="Switch note"
              >
                {activeIndex >= 0 ? activeIndex + 1 : "—"}/{noteIds.length}
                <ChevronDown className="size-3 opacity-60" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40">
              {noteIds.map((nid, i) => (
                <DropdownMenuItem
                  key={nid}
                  onClick={() => dispatch(setTileActiveNote(tileId, nid))}
                  className={cn(nid === noteId && "text-primary")}
                >
                  <StickyNote className="size-3.5" />
                  Note {i + 1}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}

        <button
          type="button"
          onClick={() => void dispatch(addNoteToTile(tileId, sessionId))}
          className={cn(
            "inline-flex h-7 items-center gap-1 rounded-md px-2 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
            noteIds.length > 1 ? "" : "ml-auto",
          )}
          title="Create a new note in this tile"
        >
          <Plus className="size-3.5" />
          New Note
        </button>
      </div>

      {/* The active note's editor (modes live on the editor itself). */}
      <div className="min-h-0 flex-1">
        {noteId ? (
          <TileNoteEditor noteId={noteId} />
        ) : (
          <div className="grid h-full place-items-center">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        )}
      </div>
    </div>
  );
}

function TileNoteEditor({
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
        editorMode="plain"
        placeholder="Jot down anything for this thread…"
        showVoiceButton={false}
        embedded
        className="h-full"
      />
    );
  }

  return (
    <div className="flex h-full flex-col min-h-0">
      <div className="shrink-0 flex items-center gap-0.5 px-2 py-1 border-b border-border/60">
        {MODES.map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => dispatch(setNoteEditorMode({ id: noteId, mode: id }))}
            aria-pressed={mode === id}
            title={label}
            className={cn(
              "inline-flex items-center gap-1 rounded-md px-1.5 h-6 text-[11px] font-medium transition-colors",
              mode === id
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
          >
            <Icon className="size-3.5" />
            <span className="@max-[20rem]:hidden">{label}</span>
          </button>
        ))}
      </div>
      <div className="flex-1 min-h-0">
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
      </div>
    </div>
  );
}
