"use client";

/**
 * useWorkingDocument(conversationId)
 *
 * The single entry point for the reusable working document. Attaches a
 * collaborative, mutable text artifact to ANY agent conversation with one prop.
 * Generalises Scribe's `useStudioAssistant` working-document plumbing.
 *
 * Owns:
 *   • local editable draft + debounced commit to the slice (the canonical
 *     content shared by every mount), mirroring `useWorkingDocumentDraft`.
 *   • debounced push of the rich `working_document` entry into the
 *     `instanceContext` slice when enabled (and removal when disabled) — the
 *     exact mechanism the agent already consumes.
 *   • debounced persistence to the bound note (when bound) on user edits.
 *   • merge-in of agent/remote edits while the user isn't actively typing.
 *
 * Controls: setEnabled, bindToNote, unbind, setTitle, openAsWindow.
 *
 * `useWorkingDocumentContextSync` is the effect-only half (no draft); mount it
 * wherever a conversation is always present (the Smart Input) so the agent
 * always receives the current document regardless of which editor is open.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { saveNoteField } from "@/features/notes/redux/thunks";
import {
  WORKING_DOCUMENT_CONTEXT_KEY,
  WORKING_DOCUMENT_LABEL,
  buildWorkingDocumentContextValue,
} from "@/features/agents/utils/workingDocumentContext";
import {
  removeContextEntry,
  setContextEntries,
} from "@/features/agents/redux/execution-system/instance-context/instance-context.slice";
import {
  markWorkingDocError,
  markWorkingDocSaving,
  setWorkingDocBinding,
  setWorkingDocContent,
  setWorkingDocEnabled,
  setWorkingDocTitle,
  NO_BINDING,
  type WorkingDocumentBinding,
} from "@/features/agents/redux/execution-system/instance-working-document/instance-working-document.slice";
import {
  selectWorkingDocBinding,
  selectWorkingDocContent,
  selectWorkingDocEnabled,
  selectWorkingDocError,
  selectWorkingDocSaving,
  selectWorkingDocTitle,
} from "@/features/agents/redux/execution-system/instance-working-document/instance-working-document.selectors";
import { bindWorkingDocumentToNoteThunk } from "@/features/agents/redux/execution-system/instance-working-document/instance-working-document.thunks";
import { useOpenWorkingDocumentWindow } from "@/features/overlays/openers/workingDocumentWindow";

const AUTOSAVE_MS = 700;
const CONTEXT_PUSH_MS = 300;

// =============================================================================
// Context sync (effect-only) — keeps the `working_document` instanceContext
// entry current for an active conversation.
// =============================================================================

export function useWorkingDocumentContextSync(conversationId: string): void {
  const dispatch = useAppDispatch();
  const enabled = useAppSelector(selectWorkingDocEnabled(conversationId));
  const content = useAppSelector(selectWorkingDocContent(conversationId));
  const binding = useAppSelector(selectWorkingDocBinding(conversationId));

  useEffect(() => {
    if (!enabled) {
      dispatch(
        removeContextEntry({
          conversationId,
          key: WORKING_DOCUMENT_CONTEXT_KEY,
        }),
      );
      return;
    }

    const timer = setTimeout(() => {
      dispatch(
        setContextEntries({
          conversationId,
          entries: [
            {
              key: WORKING_DOCUMENT_CONTEXT_KEY,
              value: buildWorkingDocumentContextValue(content, binding),
              type: "text",
              label: WORKING_DOCUMENT_LABEL,
            },
          ],
        }),
      );
    }, CONTEXT_PUSH_MS);

    return () => clearTimeout(timer);
  }, [dispatch, conversationId, enabled, content, binding]);
}

// =============================================================================
// Full hook — draft + controls
// =============================================================================

export interface UseWorkingDocumentResult {
  enabled: boolean;
  /** Canonical content (slice). Use `draft` for the editor binding. */
  content: string;
  title: string;
  binding: WorkingDocumentBinding;
  saving: boolean;
  error: string | null;
  /** Local editor value (merges remote edits when not typing). */
  draft: string;
  onChange: (value: string) => void;
  flush: () => void;
  setEnabled: (enabled: boolean) => void;
  bindToNote: (noteId: string) => void;
  unbind: () => void;
  setTitle: (title: string) => void;
  openAsWindow: () => void;
}

export function useWorkingDocument(
  conversationId: string,
): UseWorkingDocumentResult {
  const dispatch = useAppDispatch();
  const openWindow = useOpenWorkingDocumentWindow();

  const enabled = useAppSelector(selectWorkingDocEnabled(conversationId));
  const content = useAppSelector(selectWorkingDocContent(conversationId));
  const title = useAppSelector(selectWorkingDocTitle(conversationId));
  const binding = useAppSelector(selectWorkingDocBinding(conversationId));
  const saving = useAppSelector(selectWorkingDocSaving(conversationId));
  const error = useAppSelector(selectWorkingDocError(conversationId));

  // Keep the instanceContext entry current for every mount of this hook (the
  // dedicated SmartInput bridge guarantees the always-on case).
  useWorkingDocumentContextSync(conversationId);

  // ── Editable draft (mirrors useWorkingDocumentDraft) ──────────────────────
  const [draft, setDraft] = useState(content);
  const dirtyRef = useRef(false);
  const editingRef = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const draftRef = useRef(draft);
  draftRef.current = draft;

  // Pull in agent/remote edits only when the user isn't actively typing.
  useEffect(() => {
    if (!editingRef.current) setDraft(content);
  }, [content]);

  const commit = useCallback(
    (value: string) => {
      if (!dirtyRef.current) return;
      dispatch(setWorkingDocContent({ conversationId, content: value }));
      dirtyRef.current = false;

      if (binding.kind === "note" && binding.id) {
        const noteId = binding.id;
        dispatch(markWorkingDocSaving({ conversationId, saving: true }));
        void dispatch(saveNoteField({ noteId, field: "content", value }))
          .unwrap()
          .then(() =>
            dispatch(markWorkingDocSaving({ conversationId, saving: false })),
          )
          .catch(() =>
            dispatch(
              markWorkingDocError({
                conversationId,
                error: "Could not save to the bound note.",
              }),
            ),
          );
      }
    },
    [dispatch, conversationId, binding.kind, binding.id],
  );

  const onChange = useCallback(
    (value: string) => {
      editingRef.current = true;
      dirtyRef.current = true;
      setDraft(value);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        editingRef.current = false;
        commit(value);
      }, AUTOSAVE_MS);
    },
    [commit],
  );

  const flush = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    editingRef.current = false;
    commit(draftRef.current);
  }, [commit]);

  // Persist any pending edit if the editor unmounts mid-debounce.
  useEffect(() => {
    return () => {
      if (timer.current) {
        clearTimeout(timer.current);
        if (dirtyRef.current) {
          dispatch(
            setWorkingDocContent({
              conversationId,
              content: draftRef.current,
            }),
          );
        }
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Controls ──────────────────────────────────────────────────────────────
  const setEnabled = useCallback(
    (value: boolean) => {
      dispatch(setWorkingDocEnabled({ conversationId, enabled: value }));
    },
    [dispatch, conversationId],
  );

  const bindToNote = useCallback(
    (noteId: string) => {
      void dispatch(bindWorkingDocumentToNoteThunk({ conversationId, noteId }));
    },
    [dispatch, conversationId],
  );

  const unbind = useCallback(() => {
    dispatch(
      setWorkingDocBinding({ conversationId, binding: { ...NO_BINDING } }),
    );
  }, [dispatch, conversationId]);

  const setTitle = useCallback(
    (value: string) => {
      dispatch(setWorkingDocTitle({ conversationId, title: value }));
    },
    [dispatch, conversationId],
  );

  const openAsWindow = useCallback(() => {
    openWindow({ conversationId });
  }, [openWindow, conversationId]);

  return {
    enabled,
    content,
    title,
    binding,
    saving,
    error,
    draft,
    onChange,
    flush,
    setEnabled,
    bindToNote,
    unbind,
    setTitle,
    openAsWindow,
  };
}
