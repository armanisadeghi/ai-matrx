// features/education/notes/EduNoteWorkspace.tsx
//
// The Smart Notes editor surface (/education/notes/[id]). A THIN education skin
// over the canonical notes workspace: the real editor, autosave, access gating,
// version history, context menu, and Knowledge all come from `features/notes` NotesView
// (single-note mode). We only add the education action bar on top (convert / live
// capture / share / lineage). No forked editor, no forked storage.

"use client";

import { NotesView } from "@/features/notes/components/NotesView";
import { EduNoteActionBar } from "./EduNoteActionBar";

export function EduNoteWorkspace({ noteId }: { noteId: string }) {
  // Full-height editors own their internal scroll. Marking this viewport as
  // clipped keeps the education layout's reading-page end padding off it.
  return (
    <div className="flex h-full w-full min-h-0 flex-col overflow-hidden bg-textured">
      <EduNoteActionBar noteId={noteId} />
      <div className="min-h-0 flex-1">
        <NotesView
          config={{ singleNote: noteId, showSidebar: false, showTabs: false }}
        />
      </div>
    </div>
  );
}
