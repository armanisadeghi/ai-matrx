"use client";

import { QuickNoteSaveCore } from "./QuickNoteSaveCore";
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
}

export function QuickNoteSaveOverlay({
  isOpen,
  onClose,
  initialContent,
  defaultFolder = "Scratch",
  title = "Quick Save",
  initialEditorMode = "split",
}: QuickNoteSaveOverlayProps) {
  const handleSaved = () => {
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
