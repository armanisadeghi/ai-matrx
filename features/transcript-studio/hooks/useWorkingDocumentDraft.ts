"use client";

// useWorkingDocumentDraft — shared editable-draft logic for the working
// document. Both the inline WorkingDocumentHeader editor and the full-screen
// FocusedDocumentEditor use this so there is ONE place that owns:
//   • the local draft + debounced autosave (via updateWorkingDocumentContentThunk)
//   • merging in assistant/realtime edits to the same doc WHILE the user is not
//     actively typing (so the round-trip collaboration loop works: the agent
//     updates the doc, the user sees it; the user edits, the agent gets it next turn)
//   • a flush() to persist immediately (call on blur / close / unmount)

import { useCallback, useEffect, useRef, useState } from "react";
import { useAppDispatch } from "@/lib/redux/hooks";
import { updateWorkingDocumentContentThunk } from "../redux/thunks";

const AUTOSAVE_MS = 800;

export function useWorkingDocumentDraft(
  sessionId: string,
  documentId: string | undefined,
  remoteContent: string,
) {
  const dispatch = useAppDispatch();
  const [draft, setDraft] = useState(remoteContent);
  const [saving, setSaving] = useState(false);
  const dirtyRef = useRef(false);
  const editingRef = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Pull in assistant/realtime edits only when the user isn't actively typing.
  useEffect(() => {
    if (!editingRef.current) setDraft(remoteContent);
  }, [remoteContent]);

  const save = useCallback(
    async (content: string) => {
      if (!dirtyRef.current || !documentId) return;
      setSaving(true);
      await dispatch(
        updateWorkingDocumentContentThunk({
          sessionId,
          documentId,
          content,
        }),
      );
      dirtyRef.current = false;
      setSaving(false);
    },
    [dispatch, sessionId, documentId],
  );

  const onChange = useCallback(
    (value: string) => {
      editingRef.current = true;
      dirtyRef.current = true;
      setDraft(value);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        editingRef.current = false;
        void save(value);
      }, AUTOSAVE_MS);
    },
    [save],
  );

  const flush = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    editingRef.current = false;
    void save(draft);
  }, [save, draft]);

  // Persist any pending edit if the editor unmounts mid-debounce.
  useEffect(() => {
    return () => {
      if (timer.current) {
        clearTimeout(timer.current);
        if (dirtyRef.current && documentId) {
          void dispatch(
            updateWorkingDocumentContentThunk({
              sessionId,
              documentId,
              content: draftRef.current,
            }),
          );
        }
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep a ref of the latest draft for the unmount-flush above.
  const draftRef = useRef(draft);
  draftRef.current = draft;

  return { draft, saving, onChange, flush };
}
