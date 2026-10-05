"use client";

import { RecordPageHeader } from "@/features/shell/components/header/templates/RecordPageHeader";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectNoteLabel } from "@/features/notes/redux/selectors";
import { NoteVersionHistoryPanel } from "./NoteVersionHistoryPanel";

interface NoteVersionDiffPageProps {
  noteId: string;
}

export function NoteVersionDiffPage({ noteId }: NoteVersionDiffPageProps) {
  const noteLabel = useAppSelector(selectNoteLabel(noteId));

  return (
    <>
      <RecordPageHeader
        backHref={`/notes/${noteId}`}
        parents={[
          { label: "Notes", href: "/notes" },
          { label: noteLabel || "Note", href: `/notes/${noteId}` },
        ]}
        record={{ name: "Versions" }}
      />
      <div className="flex h-full flex-col overflow-hidden">
        <NoteVersionHistoryPanel noteId={noteId} variant="page" />
      </div>
    </>
  );
}
