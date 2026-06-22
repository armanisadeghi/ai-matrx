"use client";

// NoteHistoryPane — the desktop version-history side panel for a note.
//
// Built to drop into WindowPanel's `secondaryPanel` slot (history is a window
// concern, not body content). Takes ONLY instanceId + noteId; reads/writes
// Redux. Its close button drives the per-instance `historyOpen` flag, so the
// WindowPanel slot disappears. ZERO PROP DRILLING.

import React from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { ExternalLink, X } from "lucide-react";
import { useAppDispatch } from "@/lib/redux/hooks";
import { setInstanceHistoryOpen } from "../redux/slice";
import { fetchNoteContent } from "../redux/thunks";

const NoteVersionHistoryPanel = dynamic(
  () =>
    import("@/features/notes/components/diff/NoteVersionHistoryPanel").then(
      (m) => ({ default: m.NoteVersionHistoryPanel }),
    ),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-32 items-center justify-center text-xs text-muted-foreground">
        Loading version history…
      </div>
    ),
  },
);

export interface NoteHistoryPaneProps {
  instanceId: string;
  noteId: string;
}

export function NoteHistoryPane({ instanceId, noteId }: NoteHistoryPaneProps) {
  const dispatch = useAppDispatch();
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-9 shrink-0 items-center gap-2 border-b border-border bg-muted/40 px-3">
        <span className="flex-1 truncate text-xs font-semibold text-foreground">
          Version History
        </span>
        <Link
          href={`/notes/${noteId}/diff`}
          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          title="Open full diff view"
        >
          <ExternalLink className="h-3.5 w-3.5" />
        </Link>
        <button
          type="button"
          onClick={() =>
            dispatch(setInstanceHistoryOpen({ instanceId, open: false }))
          }
          aria-label="Close version history"
          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">
        <NoteVersionHistoryPanel
          noteId={noteId}
          variant="embedded"
          onVersionRestored={() => dispatch(fetchNoteContent(noteId))}
          className="h-full"
        />
      </div>
    </div>
  );
}
