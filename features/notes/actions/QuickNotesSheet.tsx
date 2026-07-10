// features/notes/actions/QuickNotesSheet.tsx
// Thin shell over the canonical NotesView — no legacy NotesLayout/NoteEditor.
"use client";

import { NotesView } from "../components/NotesView";
import { cn } from "@/lib/utils";

interface QuickNotesSheetProps {
  onClose?: () => void;
  className?: string;
}

export function QuickNotesSheet({ className }: QuickNotesSheetProps) {
  return (
    <div className={cn("h-full min-h-0", className)}>
      <NotesView
        config={{
          instanceId: "quick-notes",
          hidePageHeader: true,
          syncUrl: false,
        }}
      />
    </div>
  );
}
