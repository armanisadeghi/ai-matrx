"use client";

/**
 * FocusedDocumentEditor — full-screen "Focused Mode" editor for the working
 * document. Edits autosave (debounced) through updateWorkingDocumentContentThunk
 * and flush on close. Realtime assistant edits to the same doc still flow in
 * while not actively typing.
 */

import { useEffect, useRef, useState } from "react";
import { Check, Loader2, Minimize2 } from "lucide-react";
import { useAppDispatch } from "@/lib/redux/hooks";
import { updateWorkingDocumentContentThunk } from "../../redux/thunks";
import type { StudioDocument } from "../../types";

interface FocusedDocumentEditorProps {
  sessionId: string;
  doc: StudioDocument;
  onClose: () => void;
}

const AUTOSAVE_MS = 800;

export function FocusedDocumentEditor({
  sessionId,
  doc,
  onClose,
}: FocusedDocumentEditorProps) {
  const dispatch = useAppDispatch();
  const [draft, setDraft] = useState(doc.content);
  const [saving, setSaving] = useState(false);
  const dirtyRef = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const editingRef = useRef(false);

  // Pull in assistant/realtime edits only when the user isn't actively typing.
  useEffect(() => {
    if (!editingRef.current) setDraft(doc.content);
  }, [doc.content]);

  const save = async (content: string) => {
    if (!dirtyRef.current) return;
    setSaving(true);
    await dispatch(
      updateWorkingDocumentContentThunk({
        sessionId,
        documentId: doc.id,
        content,
      }),
    );
    dirtyRef.current = false;
    setSaving(false);
  };

  const handleChange = (value: string) => {
    editingRef.current = true;
    dirtyRef.current = true;
    setDraft(value);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      editingRef.current = false;
      void save(value);
    }, AUTOSAVE_MS);
  };

  const handleClose = () => {
    if (timer.current) clearTimeout(timer.current);
    void save(draft);
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
            onClick={handleClose}
            className="flex items-center gap-1.5 rounded-full bg-muted px-3 py-1.5 text-sm font-medium text-foreground active:bg-accent"
          >
            <Minimize2 className="h-4 w-4" />
            Done
          </button>
        </div>
      </header>

      <textarea
        value={draft}
        onChange={(e) => handleChange(e.target.value)}
        placeholder="Draft your document here, or ask the assistant to build it."
        className="min-h-0 flex-1 resize-none bg-transparent px-4 py-4 text-base leading-relaxed text-foreground outline-none placeholder:text-muted-foreground"
      />
    </div>
  );
}
