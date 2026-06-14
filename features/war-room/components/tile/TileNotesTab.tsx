"use client";

// features/war-room/components/tile/TileNotesTab.tsx
//
// Minimal Notes view: a free-form notepad backed by a real `notes` record.
// Uses ProTextarea (copy + voice built in) and the notes autosave middleware —
// dispatching updateNoteContent debounces a write to Supabase automatically.

import { useEffect, useRef } from "react";
import { Loader2 } from "lucide-react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { ProTextarea } from "@/components/official/ProTextarea";
import {
  selectNoteContent,
  selectNoteSaveState,
} from "@/features/notes/redux/selectors";
import { updateNoteContent } from "@/features/notes/redux/slice";
import { fetchNoteContent } from "@/features/notes/redux/thunks";
import { selectTileById } from "@/features/war-room/redux/selectors";
import { createTileNote } from "@/features/war-room/redux/thunks";

export function TileNotesTab({
  tileId,
  sessionId,
}: {
  tileId: string;
  sessionId: string;
}) {
  const dispatch = useAppDispatch();
  const tile = useAppSelector(selectTileById(tileId));
  const noteId = tile?.note_id ?? null;
  const ensuringRef = useRef(false);

  // Lazily create the tile's note the first time the Notes tab is opened.
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

  return <TileNoteEditor noteId={noteId} />;
}

function TileNoteEditor({ noteId }: { noteId: string }) {
  const dispatch = useAppDispatch();
  const content = useAppSelector(selectNoteContent(noteId));
  const saveState = useAppSelector(selectNoteSaveState(noteId));

  useEffect(() => {
    if (content === undefined) dispatch(fetchNoteContent(noteId));
  }, [noteId, content, dispatch]);

  return (
    <div className="relative h-full p-2">
      <ProTextarea
        value={content ?? ""}
        onChange={(e) =>
          dispatch(updateNoteContent({ id: noteId, content: e.target.value }))
        }
        placeholder="Jot down anything for this thread…"
        showCopyButton
        wrapperClassName="h-full"
        className="h-full resize-none border-0 bg-transparent px-1 text-sm focus-visible:ring-0"
      />
      {saveState === "saving" ? (
        <span className="pointer-events-none absolute bottom-3 left-3 text-[10px] text-muted-foreground">
          Saving…
        </span>
      ) : null}
    </div>
  );
}
