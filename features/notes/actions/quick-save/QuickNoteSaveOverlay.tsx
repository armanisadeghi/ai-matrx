"use client";

import type { Note } from "@/features/notes/types";
import {
  QuickNoteSaveCore,
  type PostSaveAction,
} from "./QuickNoteSaveCore";
import type { EditorMode } from "@/features/notes/components/NoteEditorCore";
import FullScreenOverlay from "@/components/official/FullScreenOverlay";

export interface QuickNoteSaveOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  initialContent: string;
  defaultFolder?: string;
  title?: string;
  /**
   * Forwards to `QuickNoteSaveCore.initialEditorMode`. Numerous call sites
   * dispatch this through `openOverlay({ overlayId: "saveToNotes" })`; the
   * overlay used to hardcode "split", silently dropping the value.
   */
  initialEditorMode?: EditorMode;
  onSaved?: (note?: Note, action?: PostSaveAction) => void;
}

export function QuickNoteSaveOverlay({
  isOpen,
  onClose,
  initialContent,
  defaultFolder = "Scratch",
  title = "Quick Save",
  initialEditorMode = "split",
  onSaved,
}: QuickNoteSaveOverlayProps) {
  const handleSaved = (note: Note, action: PostSaveAction) => {
    onSaved?.(note, action);
    onClose();
  };

  return (
    <FullScreenOverlay
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      compactTabs
      tabs={[
        {
          id: "editor",
          label: "Editor",
          content: (
            <div className="h-full min-h-0 p-3">
              <QuickNoteSaveCore
                initialContent={initialContent}
                defaultFolder={defaultFolder}
                initialEditorMode={initialEditorMode}
                onSaved={handleSaved}
                onCancel={onClose}
              />
            </div>
          ),
        },
      ]}
    />
  );
}
