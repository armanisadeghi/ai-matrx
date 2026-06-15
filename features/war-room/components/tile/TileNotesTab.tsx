"use client";

// features/war-room/components/tile/TileNotesTab.tsx
//
// Notes view backed by a real `notes` record + the notes autosave middleware.
// Full view (Notes tab) offers Text / Matrx Split / Preview modes via the
// canonical NoteEditorCore. Compact view (the "All" tab) is a single open
// editor that fills its section — no double layering.

import { useEffect, useRef } from "react";
import { Loader2, Type, Columns2, Eye } from "lucide-react";
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
import { selectTileById } from "@/features/war-room/redux/selectors";
import { createTileNote } from "@/features/war-room/redux/thunks";
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
  const tile = useAppSelector(selectTileById(tileId));
  const noteId = tile?.note_id ?? null;
  const ensuringRef = useRef(false);

  // Lazily create the tile's note the first time the Notes view is opened.
  useEffect(() => {
    if (noteId || ensuringRef.current) return;
    ensuringRef.current = true;
    dispatch(createTileNote(tileId, sessionId));
  }, [noteId, tileId, sessionId, dispatch]);

  if (!noteId) {
    return (
      <div className="h-full grid place-items-center">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return <TileNoteEditor noteId={noteId} compact={compact} />;
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
    <div className="h-full flex flex-col min-h-0">
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
