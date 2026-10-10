/**
 * features/files/virtual-sources/adapters/NotesInlinePreview.tsx
 *
 * Inline preview for the Notes adapter: the cloud-files preview pane shows the
 * note with THE canonical note component (`NoteWorkspace` — the four-mode
 * switch, formatting, outline / versions / clean-up, the note menu, the one
 * bottom row, the editor with its own self-saving). This file only makes sure
 * the note is in the store and hands a load failure to <AccessGate>.
 */

"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { AccessGate } from "@/features/access-gate/components/AccessGate";
import { NoteWorkspace } from "@/features/notes/components/NoteWorkspace";
import { selectNoteById } from "@/features/notes/redux/selectors";
import { fetchNoteContent } from "@/features/notes/redux/thunks";
import type { InlinePreviewProps } from "@/features/files/virtual-sources/types";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";

export function NotesInlinePreview({ id }: InlinePreviewProps) {
  const dispatch = useAppDispatch();
  const note = useAppSelector(selectNoteById(id));
  // A load failure is never explained here: a zero-row read is denied /
  // deleted / stale-id / signed-out, and this panel cannot tell them apart.
  // It hands the raw outcome to <AccessGate>, which asks the platform.
  const [failure, setFailure] = useState<{ error: unknown } | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    setFailure(null);
    dispatch(fetchNoteContent(id))
      .unwrap()
      .catch((error: unknown) => setFailure({ error }));
  }, [dispatch, id, attempt]);

  if (failure && !note) {
    return (
      <div className="h-full w-full overflow-auto">
        <AccessGate
          token="note"
          id={id}
          error={failure.error}
          onRetry={() => setAttempt((n) => n + 1)}
          fallbackHref="/notes"
          fallbackLabel="All notes"
        />
      </div>
    );
  }

  if (!note) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-muted/20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return <NoteWorkspace instanceId={`files-note:${id}`} noteId={id} />;
}
