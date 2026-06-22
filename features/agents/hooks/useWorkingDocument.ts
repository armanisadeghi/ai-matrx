"use client";

/**
 * useWorkingDocument(conversationId, kind?)
 *
 * The single entry point for the reusable per-conversation documents. Two kinds
 * share this hook:
 *   - "working" (default) — the collaborative doc the agent reads AND writes.
 *   - "scratch"           — the user's private scratchpad; the agent reads it
 *                           (read-only context value) but never writes it.
 *
 * Owns:
 *   • local editable draft + debounced commit to the slice (the canonical
 *     content shared by every mount of the same conversation+kind).
 *   • debounced push of the rich context entry into the `instanceContext` slice
 *     when enabled (and removal when disabled) — working publishes the mutable
 *     `working_document` value; scratch publishes the read-only `user_scratchpad`
 *     value.
 *   • debounced persistence to the durable source (cx document, or a bound note
 *     for the working kind) on user edits.
 *   • merge-in of agent/remote edits while the user isn't actively typing.
 *
 * Controls: setEnabled (persisted), bindToNote, unbind, linkToDocument, setTitle,
 * openAsWindow.
 *
 * `useWorkingDocumentContextSync` is the effect-only half (no draft); mount it
 * wherever a conversation is always present (the Smart Input) so the agent
 * always receives the current document regardless of which editor is open.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { supabase } from "@/utils/supabase/client";
import { saveNoteField } from "@/features/notes/redux/thunks";
import {
  USER_SCRATCHPAD_CONTEXT_KEY,
  USER_SCRATCHPAD_LABEL,
  WORKING_DOCUMENT_CONTEXT_KEY,
  WORKING_DOCUMENT_LABEL,
  buildUserScratchpadContextValue,
  buildWorkingDocumentContextValue,
} from "@/features/agents/utils/workingDocumentContext";
import {
  removeContextEntry,
  setContextEntries,
} from "@/features/agents/redux/execution-system/instance-context/instance-context.slice";
import {
  applyAgentWorkingDocContent,
  DEFAULT_DOC_KIND,
  markWorkingDocError,
  markWorkingDocSaving,
  setWorkingDocContent,
  setWorkingDocTitle,
  type WorkingDocumentBinding,
  type WorkingDocumentKind,
} from "@/features/agents/redux/execution-system/instance-working-document/instance-working-document.slice";
import {
  selectWorkingDocBinding,
  selectWorkingDocContent,
  selectWorkingDocEnabled,
  selectWorkingDocError,
  selectWorkingDocSaving,
  selectWorkingDocTitle,
} from "@/features/agents/redux/execution-system/instance-working-document/instance-working-document.selectors";
import {
  bindWorkingDocumentToNoteThunk,
  ensureConversationDocumentThunk,
  hydrateConversationDocumentsThunk,
  linkConversationDocumentThunk,
  setConversationDocumentEnabledThunk,
  unbindWorkingDocumentThunk,
  type BindNoteMode,
} from "@/features/agents/redux/execution-system/instance-working-document/instance-working-document.thunks";
import {
  rowToCxWorkingDocument,
  updateCxWorkingDocumentContent,
  updateCxWorkingDocumentTitle,
  type CxWorkingDocumentRow,
} from "@/features/agents/redux/execution-system/instance-working-document/cx-working-document.service";
import { useOpenWorkingDocumentWindow } from "@/features/overlays/openers/workingDocumentWindow";

const AUTOSAVE_MS = 700;
const CONTEXT_PUSH_MS = 300;

/** The instanceContext key + label + value builder for a document kind. */
function contextDescriptorFor(
  kind: WorkingDocumentKind,
  content: string,
  binding: WorkingDocumentBinding,
): {
  key: string;
  label: string;
  value: ReturnType<typeof buildWorkingDocumentContextValue>;
} {
  if (kind === "scratch") {
    return {
      key: USER_SCRATCHPAD_CONTEXT_KEY,
      label: USER_SCRATCHPAD_LABEL,
      value: buildUserScratchpadContextValue(content),
    };
  }
  return {
    key: WORKING_DOCUMENT_CONTEXT_KEY,
    label: WORKING_DOCUMENT_LABEL,
    value: buildWorkingDocumentContextValue(content, binding),
  };
}

// =============================================================================
// Context sync (effect-only) — keeps the document's instanceContext entry
// current for an active conversation.
// =============================================================================

export function useWorkingDocumentContextSync(
  conversationId: string,
  kind: WorkingDocumentKind = DEFAULT_DOC_KIND,
): void {
  const dispatch = useAppDispatch();
  const enabled = useAppSelector(selectWorkingDocEnabled(conversationId, kind));
  const content = useAppSelector(selectWorkingDocContent(conversationId, kind));
  const binding = useAppSelector(selectWorkingDocBinding(conversationId, kind));

  // When enabled and not yet bound to a durable source, provision the backing
  // `cx_working_documents` row + junction link (the Scribe pattern). For the
  // working kind this flips the published value to `persist: "auto"` so the
  // agent's ctx_patch edits persist server-side and round-trip back. Never
  // overrides an explicit note binding the user picked.
  useEffect(() => {
    if (enabled && binding.kind === "none") {
      void dispatch(ensureConversationDocumentThunk({ conversationId, kind }));
    }
  }, [dispatch, conversationId, kind, enabled, binding.kind]);

  // Live channel: edits to the bound document (the agent's ctx_patch writes for
  // the working kind, or edits from another conversation linked to the same
  // doc) arrive here as UPDATEs. We filter by the DOCUMENT id (binding.id), not
  // conversation_id, so linked conversations resolve correctly.
  useEffect(() => {
    if (!enabled || binding.kind !== "cx_working_document" || !binding.id) {
      return;
    }
    const documentId = binding.id;
    const channel = supabase
      .channel(`cx-working-doc:${documentId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "cx_working_documents",
          filter: `id=eq.${documentId}`,
        },
        (payload) => {
          if (payload.eventType === "DELETE") return;
          const row = payload.new as CxWorkingDocumentRow | undefined;
          if (!row) return;
          const doc = rowToCxWorkingDocument(row);
          dispatch(
            applyAgentWorkingDocContent({
              conversationId,
              kind,
              content: doc.content ?? "",
            }),
          );
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [dispatch, conversationId, kind, enabled, binding.kind, binding.id]);

  useEffect(() => {
    const { key, label, value } = contextDescriptorFor(kind, content, binding);

    if (!enabled) {
      dispatch(removeContextEntry({ conversationId, key }));
      return;
    }

    const timer = setTimeout(() => {
      dispatch(
        setContextEntries({
          conversationId,
          entries: [{ key, value, type: "text", label }],
        }),
      );
    }, CONTEXT_PUSH_MS);

    return () => clearTimeout(timer);
  }, [dispatch, conversationId, kind, enabled, content, binding]);
}

/**
 * Always-on per-conversation bridge: restore the PERSISTED opt-in/link for both
 * kinds on mount, then keep both documents' instanceContext entries current.
 * Mount this once where a conversation is always present (the Smart Input), so
 * the agent receives whichever documents the user has turned on — and a doc
 * they enabled in a previous session comes back — regardless of which editor
 * (if any) is open.
 */
export function useConversationDocumentsBridge(conversationId: string): void {
  const dispatch = useAppDispatch();
  useEffect(() => {
    void dispatch(hydrateConversationDocumentsThunk({ conversationId }));
  }, [dispatch, conversationId]);
  useWorkingDocumentContextSync(conversationId, "working");
  useWorkingDocumentContextSync(conversationId, "scratch");
}

// =============================================================================
// Full hook — draft + controls
// =============================================================================

export interface UseWorkingDocumentResult {
  kind: WorkingDocumentKind;
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
  bindToNote: (noteId: string, mode?: BindNoteMode) => void;
  unbind: () => void;
  /** Link this conversation's document to an existing one (cross-conversation). */
  linkToDocument: (documentId: string) => void;
  setTitle: (title: string) => void;
  openAsWindow: () => void;
}

export function useWorkingDocument(
  conversationId: string,
  kind: WorkingDocumentKind = DEFAULT_DOC_KIND,
): UseWorkingDocumentResult {
  const dispatch = useAppDispatch();
  const openWindow = useOpenWorkingDocumentWindow();

  const enabled = useAppSelector(selectWorkingDocEnabled(conversationId, kind));
  const content = useAppSelector(selectWorkingDocContent(conversationId, kind));
  const title = useAppSelector(selectWorkingDocTitle(conversationId, kind));
  const binding = useAppSelector(selectWorkingDocBinding(conversationId, kind));
  const saving = useAppSelector(selectWorkingDocSaving(conversationId, kind));
  const error = useAppSelector(selectWorkingDocError(conversationId, kind));

  // Keep the instanceContext entry current for every mount of this hook (the
  // dedicated SmartInput bridge guarantees the always-on case).
  useWorkingDocumentContextSync(conversationId, kind);

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
      dispatch(setWorkingDocContent({ conversationId, kind, content: value }));
      dirtyRef.current = false;

      if (binding.kind === "cx_working_document" && binding.id) {
        const docId = binding.id;
        dispatch(markWorkingDocSaving({ conversationId, kind, saving: true }));
        void updateCxWorkingDocumentContent(docId, value)
          .then(() =>
            dispatch(
              markWorkingDocSaving({ conversationId, kind, saving: false }),
            ),
          )
          .catch(() =>
            dispatch(
              markWorkingDocError({
                conversationId,
                kind,
                error: "Could not save the document.",
              }),
            ),
          );
        return;
      }

      if (binding.kind === "note" && binding.id) {
        const noteId = binding.id;
        dispatch(markWorkingDocSaving({ conversationId, kind, saving: true }));
        void dispatch(saveNoteField({ noteId, field: "content", value }))
          .unwrap()
          .then(() =>
            dispatch(
              markWorkingDocSaving({ conversationId, kind, saving: false }),
            ),
          )
          .catch(() =>
            dispatch(
              markWorkingDocError({
                conversationId,
                kind,
                error: "Could not save to the bound note.",
              }),
            ),
          );
      }
    },
    [dispatch, conversationId, kind, binding.kind, binding.id],
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
              kind,
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
      // Persisted: writes the opt-in flag to the cx_conversation_documents
      // junction so it survives reloads.
      void dispatch(
        setConversationDocumentEnabledThunk({
          conversationId,
          kind,
          enabled: value,
        }),
      );
    },
    [dispatch, conversationId, kind],
  );

  const bindToNote = useCallback(
    (noteId: string, mode?: BindNoteMode) => {
      void dispatch(
        bindWorkingDocumentToNoteThunk({ conversationId, kind, noteId, mode }),
      );
    },
    [dispatch, conversationId, kind],
  );

  const unbind = useCallback(() => {
    void dispatch(unbindWorkingDocumentThunk({ conversationId, kind }));
  }, [dispatch, conversationId, kind]);

  const linkToDocument = useCallback(
    (documentId: string) => {
      void dispatch(
        linkConversationDocumentThunk({ conversationId, kind, documentId }),
      );
    },
    [dispatch, conversationId, kind],
  );

  const setTitle = useCallback(
    (value: string) => {
      dispatch(setWorkingDocTitle({ conversationId, kind, title: value }));
      // Persist the chosen name to the durable row so it survives reloads and
      // shows everywhere this document appears.
      if (binding.kind === "cx_working_document" && binding.id) {
        void updateCxWorkingDocumentTitle(binding.id, value).catch(() =>
          dispatch(
            markWorkingDocError({
              conversationId,
              kind,
              error: "Could not save the document name.",
            }),
          ),
        );
      }
    },
    [dispatch, conversationId, kind, binding.kind, binding.id],
  );

  const openAsWindow = useCallback(() => {
    openWindow({ conversationId });
  }, [openWindow, conversationId]);

  return {
    kind,
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
    linkToDocument,
    setTitle,
    openAsWindow,
  };
}
