"use client";

import { NoteVersionHistoryPanel } from "./NoteVersionHistoryPanel";

interface NoteVersionDiffPageProps {
  noteId: string;
}

export function NoteVersionDiffPage({ noteId }: NoteVersionDiffPageProps) {
  return (
    <div
      className="flex h-full flex-col overflow-hidden"
      style={{ paddingTop: "var(--shell-header-h)" }}
    >
      <NoteVersionHistoryPanel noteId={noteId} variant="page" />
    </div>
  );
}
