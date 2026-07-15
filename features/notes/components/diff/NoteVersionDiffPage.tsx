"use client";

import { ChevronLeftTapButton } from "@/components/icons/tap-buttons";
import PageHeader from "@/features/shell/components/header/PageHeader";
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
      <PageHeader>
        <div className="flex items-center w-full min-w-0 gap-0 p-0">
          <ChevronLeftTapButton
            href={`/notes/${noteId}`}
            variant="transparent"
            ariaLabel="Back to note"
          />
          <h1 className="ml-2 text-sm font-medium text-foreground truncate">
            {noteLabel ? `Versions — ${noteLabel}` : "Version History"}
          </h1>
        </div>
      </PageHeader>
      <div className="flex h-full flex-col overflow-hidden">
        <NoteVersionHistoryPanel noteId={noteId} variant="page" />
      </div>
    </>
  );
}
