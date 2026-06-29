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
 * openInCanvas.
 *
 * `useWorkingDocumentContextSync` is the effect-only half (no draft); mount it
 * wherever a conversation is always present (the Smart Input) so the agent
 * always receives the current document regardless of which editor is open.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { supabase } from "@/utils/supabase/client";
import { saveNoteField } from "@/features/notes/redux/thunks";
import { useAutoLabel } from "@/features/notes/hooks/useAutoLabel";
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
  clearWorkingDocConflict,
  markWorkingDocConflict,
  markWorkingDocMaterialized,
  markWorkingDocSaving,
  setWorkingDocContent,
  setWorkingDocTitle,
  setWorkingDocVersion,
  type WorkingDocumentBinding,
  type WorkingDocumentKind,
} from "@/features/agents/redux/execution-system/instance-working-document/instance-working-document.slice";
import {
  selectWorkingDocBinding,
  selectWorkingDocConflict,
  selectWorkingDocContent,
  selectWorkingDocEnabled,
  selectWorkingDocError,
  selectWorkingDocMaterialized,
  selectWorkingDocSaving,
  selectWorkingDocTitle,
  selectWorkingDocVersion,
} from "@/features/agents/redux/execution-system/instance-working-document/instance-working-document.selectors";
import {
  bindWorkingDocumentToNoteThunk,
  hydrateConversationDocumentsThunk,
  linkConversationDocumentThunk,
  materializeWorkingDocumentThunk,
  setConversationDocumentEnabledThunk,
  unbindWorkingDocumentThunk,
  type BindNoteMode,
} from "@/features/agents/redux/execution-system/instance-working-document/instance-working-document.thunks";
import {
  commitWorkingDocumentContent,
  rowToCxWorkingDocument,
  updateCxWorkingDocumentTitle,
  type CxWorkingDocumentRow,
} from "@/features/agents/redux/execution-system/instance-working-document/cx-working-document.service";
import { selectIsCacheOnly } from "@/features/agents/redux/execution-system/conversations/conversations.selectors";
import { useCanvas } from "@/features/canvas/hooks/useCanvas";

const AUTOSAVE_MS = 700;

/** The instanceContext key + label + value builder for a document kind. */
function contextDescriptorFor(args: {
  kind: WorkingDocumentKind;
  content: string;
  binding: WorkingDocumentBinding;
  conversationId: string;
  organizationId: string | null;
  title: string;
  version: number;
}): {
  key: string;
  label: string;
  value: ReturnType<typeof buildWorkingDocumentContextValue>;
} {
  if (args.kind === "scratch") {
    return {
      key: USER_SCRATCHPAD_CONTEXT_KEY,
      label: USER_SCRATCHPAD_LABEL,
      value: buildUserScratchpadContextValue(args.content),
    };
  }
  return {
    key: WORKING_DOCUMENT_CONTEXT_KEY,
    label: WORKING_DOCUMENT_LABEL,
    value: buildWorkingDocumentContextValue({
      content: args.content,
      binding: args.binding,
      conversationId: args.conversationId,
      organizationId: args.organizationId,
      docKind: args.kind,
      title: args.title,
      version: args.version,
    }),
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
  const title = useAppSelector(selectWorkingDocTitle(conversationId, kind));
  const version = useAppSelector(selectWorkingDocVersion(conversationId, kind));
  const materialized = useAppSelector(
    selectWorkingDocMaterialized(conversationId, kind),
  );
  const organizationId = useAppSelector(
    (state) =>
      state.conversations.byConversationId[conversationId]?.organizationId ??
      null,
  );
  // `cacheOnly` is true until the server confirms the cx_conversation row exists.
  const isCacheOnly = useAppSelector(selectIsCacheOnly(conversationId));

  // MATERIALIZE-ON-WRITE: create the durable row + conversation edge the moment
  // content FIRST exists — never on mere activation (that produced the empty-row
  // churn). Idempotent + gated (no-op once materialized, while empty, or while
  // the conversation is unconfirmed); re-fires harmlessly as content grows. The
  // agent-first case is handled server-side and reflected via the stream.
  useEffect(() => {
    if (
      enabled &&
      binding.kind === "cx_working_document" &&
      binding.id &&
      !materialized &&
      content.trim() !== "" &&
      !isCacheOnly
    ) {
      void dispatch(materializeWorkingDocumentThunk({ conversationId, kind }));
    }
  }, [
    dispatch,
    conversationId,
    kind,
    enabled,
    binding.kind,
    binding.id,
    materialized,
    content,
    isCacheOnly,
  ]);

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
          schema: "workbench",
          table: "working_documents",
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
          // Latch the new version + mark materialized (a realtime echo proves the
          // row exists) so the next turn's base_version is current.
          dispatch(
            markWorkingDocMaterialized({
              conversationId,
              kind,
              version: doc.version,
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
    const { key, label, value } = contextDescriptorFor({
      kind,
      content,
      binding,
      conversationId,
      organizationId,
      title,
      version,
    });

    if (!enabled) {
      dispatch(removeContextEntry({ conversationId, key }));
      return;
    }

    // Publish IMMEDIATELY (no debounce). The slice content updates on every
    // keystroke (onChange), and the agent must receive the user's EXACT latest
    // text on the next turn — a debounce here would drop the final keystrokes
    // typed just before send (the request reads the published instanceContext
    // entry, not the slice). The publish is a cheap Redux write.
    dispatch(
      setContextEntries({
        conversationId,
        entries: [{ key, value, type: "text", label }],
      }),
    );
  }, [
    dispatch,
    conversationId,
    kind,
    enabled,
    content,
    binding,
    organizationId,
    title,
    version,
  ]);
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
  /** A pending concurrent-edit conflict to reconcile (the agent's version), or null. */
  conflict: { agentVersion: number; agentContent: string } | null;
  /** Resolve a conflict: keep the user's draft, or adopt the agent's version. */
  resolveConflict: (choice: "keep-mine" | "take-agent") => void;
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
  /** Open this document as an item in the Canvas (the unified live workspace). */
  openInCanvas: () => void;
}

export function useWorkingDocument(
  conversationId: string,
  kind: WorkingDocumentKind = DEFAULT_DOC_KIND,
): UseWorkingDocumentResult {
  const dispatch = useAppDispatch();
  const canvas = useCanvas();

  const enabled = useAppSelector(selectWorkingDocEnabled(conversationId, kind));
  const content = useAppSelector(selectWorkingDocContent(conversationId, kind));
  const title = useAppSelector(selectWorkingDocTitle(conversationId, kind));
  const binding = useAppSelector(selectWorkingDocBinding(conversationId, kind));
  const saving = useAppSelector(selectWorkingDocSaving(conversationId, kind));
  const error = useAppSelector(selectWorkingDocError(conversationId, kind));
  const materialized = useAppSelector(
    selectWorkingDocMaterialized(conversationId, kind),
  );
  const version = useAppSelector(selectWorkingDocVersion(conversationId, kind));
  const conflict = useAppSelector(
    selectWorkingDocConflict(conversationId, kind),
  );
  // Latched in refs so the debounced commit reads the LATEST values at fire time
  // (not those captured when the callback was created).
  const versionRef = useRef(version);
  versionRef.current = version;
  const conflictRef = useRef(conflict);
  conflictRef.current = conflict;

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
      // Don't auto-save over an unresolved conflict — the user must reconcile
      // first (their draft is preserved meanwhile).
      if (conflictRef.current) return;
      dirtyRef.current = false;
      // The slice content is already current (onChange writes it on every
      // keystroke so the agent always sees the latest); here we persist to the
      // durable source.
      const done = () =>
        dispatch(markWorkingDocSaving({ conversationId, kind, saving: false }));

      if (binding.kind === "cx_working_document" && binding.id) {
        const docId = binding.id;
        dispatch(markWorkingDocSaving({ conversationId, kind, saving: true }));
        const fail = () =>
          dispatch(
            markWorkingDocError({
              conversationId,
              kind,
              error: "Could not save the document.",
            }),
          );
        if (materialized) {
          // OPTIMISTIC-CONCURRENCY write: refused if a concurrent edit (the agent
          // this turn) advanced the row. On conflict we DON'T clobber — we record
          // the agent's version for the user to diff + reconcile, keeping their
          // draft intact. Nothing is lost (both versions are in history).
          void commitWorkingDocumentContent(docId, value, versionRef.current)
            .then((res) => {
              if (res.status === "saved") {
                dispatch(
                  setWorkingDocVersion({
                    conversationId,
                    kind,
                    version: res.document.version,
                  }),
                );
                done();
              } else {
                dispatch(
                  markWorkingDocConflict({
                    conversationId,
                    kind,
                    agentVersion: res.document.version,
                    agentContent: res.document.content ?? "",
                  }),
                );
                console.warn(
                  "[working-document] save refused — a concurrent edit advanced " +
                    "the document; surfaced a conflict for the user to reconcile",
                  { conversationId, kind },
                );
              }
            })
            .catch(fail);
        } else {
          // First content → create the durable row + conversation edge, seeded
          // with the current content (materialize-on-write).
          void dispatch(materializeWorkingDocumentThunk({ conversationId, kind }))
            .unwrap()
            .then(done)
            .catch(fail);
        }
        return;
      }

      if (binding.kind === "note" && binding.id) {
        const noteId = binding.id;
        dispatch(markWorkingDocSaving({ conversationId, kind, saving: true }));
        void dispatch(saveNoteField({ noteId, field: "content", value }))
          .unwrap()
          .then(done)
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
    [dispatch, conversationId, kind, binding.kind, binding.id, materialized],
  );

  const onChange = useCallback(
    (value: string) => {
      editingRef.current = true;
      dirtyRef.current = true;
      setDraft(value);
      // Keep the canonical slice content current on EVERY keystroke so the
      // agent receives the user's exact latest text on the next turn (the
      // durable DB write stays debounced via commit below).
      dispatch(setWorkingDocContent({ conversationId, kind, content: value }));
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        editingRef.current = false;
        commit(value);
      }, AUTOSAVE_MS);
    },
    [dispatch, conversationId, kind, commit],
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
      // Trim so a cleared field never persists a blank name (the doc falls back
      // to its auto-derived name instead — see useAutoLabel below).
      const title = value.trim();
      dispatch(setWorkingDocTitle({ conversationId, kind, title }));
      // Persist to the durable row only once it exists; before materialize the
      // title lives in Redux and is carried up by materializeWorkingDocument.
      if (binding.kind === "cx_working_document" && binding.id && materialized) {
        void updateCxWorkingDocumentTitle(binding.id, title).catch(() =>
          dispatch(
            markWorkingDocError({
              conversationId,
              kind,
              error: "Could not save the document name.",
            }),
          ),
        );
      } else if (binding.kind === "note" && binding.id) {
        void dispatch(
          saveNoteField({ noteId: binding.id, field: "label", value: title }),
        );
      }
    },
    [dispatch, conversationId, kind, binding.kind, binding.id, materialized],
  );

  // AUTO-NAMING: when the document is unnamed, derive a name from its content
  // (H1 / first non-empty line, markdown markers stripped — the same primitive
  // notes uses) once content meets a threshold. The user can always rename; a
  // manual name (non-empty title) stops auto-generation. Never forces the user
  // to name the document, and never leaves a blank name.
  useAutoLabel({
    content,
    currentLabel: title,
    onLabelChange: setTitle,
    enabled,
    maxLength: 60,
  });

  // CONFLICT RESOLUTION: the user picks which version wins after a concurrent
  // edit. "take-agent" adopts the agent's version; "keep-mine" re-saves the
  // user's preserved draft over it (the agent's version stays in history).
  const resolveConflict = useCallback(
    (choice: "keep-mine" | "take-agent") => {
      const c = conflictRef.current;
      if (!c || binding.kind !== "cx_working_document" || !binding.id) {
        dispatch(clearWorkingDocConflict({ conversationId, kind }));
        return;
      }
      if (choice === "take-agent") {
        dispatch(
          applyAgentWorkingDocContent({
            conversationId,
            kind,
            content: c.agentContent,
          }),
        );
        dispatch(
          setWorkingDocVersion({ conversationId, kind, version: c.agentVersion }),
        );
        setDraft(c.agentContent);
        editingRef.current = false;
        dispatch(clearWorkingDocConflict({ conversationId, kind }));
        return;
      }
      // keep-mine: write the user's current draft, based on the agent's version
      // so it lands. If another edit raced in the meantime, re-surface.
      const docId = binding.id;
      const mine = draftRef.current;
      dispatch(markWorkingDocSaving({ conversationId, kind, saving: true }));
      void commitWorkingDocumentContent(docId, mine, c.agentVersion)
        .then((res) => {
          if (res.status === "saved") {
            dispatch(setWorkingDocContent({ conversationId, kind, content: mine }));
            dispatch(
              setWorkingDocVersion({
                conversationId,
                kind,
                version: res.document.version,
              }),
            );
            dispatch(clearWorkingDocConflict({ conversationId, kind }));
            dispatch(markWorkingDocSaving({ conversationId, kind, saving: false }));
          } else {
            dispatch(
              markWorkingDocConflict({
                conversationId,
                kind,
                agentVersion: res.document.version,
                agentContent: res.document.content ?? "",
              }),
            );
          }
        })
        .catch(() =>
          dispatch(
            markWorkingDocError({
              conversationId,
              kind,
              error: "Could not save your version.",
            }),
          ),
        );
    },
    [dispatch, conversationId, kind, binding.kind, binding.id],
  );

  const openInCanvas = useCallback(() => {
    canvas.open({
      type: kind === "scratch" ? "scratchpad" : "working_document",
      data: { conversationId, kind },
      metadata: {
        title:
          title || (kind === "scratch" ? "Scratchpad" : "Working document"),
        conversationId,
        // Stable dedup key so reopening reuses the same Canvas item instead of
        // stacking duplicates (openCanvas dedups on sourceMessageId).
        sourceMessageId: `wd:${conversationId}:${kind}`,
      },
    });
  }, [canvas, conversationId, kind, title]);

  return {
    kind,
    enabled,
    content,
    title,
    binding,
    saving,
    error,
    conflict,
    resolveConflict,
    draft,
    onChange,
    flush,
    setEnabled,
    bindToNote,
    unbind,
    linkToDocument,
    setTitle,
    openInCanvas,
  };
}
