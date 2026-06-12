"use client";

/**
 * FocusedDocumentEditor — full-screen "Focused Mode" editor for the working
 * document. Edits autosave (debounced) through updateWorkingDocumentContentThunk
 * and flush on close. Realtime assistant edits to the same doc still flow in
 * while not actively typing.
 */

import { useRef } from "react";
import { Check, Loader2, Minimize2 } from "lucide-react";
import {
  ProTextarea,
  type ProTextareaElement,
} from "@/components/official/ProTextarea";
import { useWorkingDocumentDraft } from "../../hooks/useWorkingDocumentDraft";
import type { StudioDocument } from "../../types";

interface FocusedDocumentEditorProps {
  sessionId: string;
  doc: StudioDocument;
  onClose: () => void;
}

export function FocusedDocumentEditor({
  sessionId,
  doc,
  onClose,
}: FocusedDocumentEditorProps) {
  const textareaRef = useRef<ProTextareaElement>(null);
  const { draft, saving, onChange, flush } = useWorkingDocumentDraft(
    sessionId,
    doc.id,
    doc.content,
  );

  const handleCloseRequest = () => {
    textareaRef.current?.requestClose?.();
  };

  const handleCloseConfirmed = () => {
    flush();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-textured">
      <header className="flex shrink-0 items-center gap-2 border-b border-border bg-card/95 px-3 pt-[env(safe-area-inset-top)] backdrop-blur">
        <div className="flex h-12 w-full items-center gap-2">
          <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
            {doc.title || "Working document"}
          </span>
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            {saving ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Saving
              </>
            ) : (
              <>
                <Check className="h-3.5 w-3.5" />
                Saved
              </>
            )}
          </span>
          <button
            type="button"
            onClick={handleCloseRequest}
            className="flex items-center gap-1.5 rounded-full bg-muted px-3 py-1.5 text-sm font-medium text-foreground active:bg-accent"
          >
            <Minimize2 className="h-4 w-4" />
            Done
          </button>
        </div>
      </header>

      <ProTextarea
        ref={textareaRef}
        value={draft}
        onChange={(e) => onChange(e.target.value)}
        onBlur={flush}
        onRequestClose={handleCloseConfirmed}
        placeholder="Draft your document here, or ask the assistant to build it."
        wrapperClassName="flex min-h-0 flex-1 flex-col px-4 py-4"
        className="h-full min-h-0 flex-1 resize-none border-0 bg-transparent text-base leading-relaxed text-foreground shadow-none focus-visible:ring-0"
      />
    </div>
  );
}
