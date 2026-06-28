/**
 * Instance Working Document thunks.
 *
 * Side-effectful operations for the per-conversation documents (working +
 * scratch). Every thunk takes an optional `kind` (default "working").
 *
 *   - `hydrateConversationDocumentsThunk` — on mount, restore the PERSISTED
 *     opt-in/link for both kinds from the `cx_conversation_documents` junction,
 *     so a doc the user turned on (or linked) survives a reload.
 *   - `setConversationDocumentEnabledThunk` — toggle a doc on/off AND persist
 *     the flag to the junction.
 *   - `ensureConversationDocumentThunk` — provision the durable backing row +
 *     junction link and bind to it (the chat default — the Scribe pattern).
 *   - `linkConversationDocumentThunk` — point this conversation's (kind) at an
 *     EXISTING document from another conversation (cross-conversation linking).
 *   - `bindWorkingDocumentToNoteThunk` / `unbindWorkingDocumentThunk` — bind a
 *     working doc to / from a `workbench.notes` row (working kind only).
 *   - `syncWorkingDocumentFromAgentThunk` — resolve an agent writeback from a
 *     stream `context_changed` event (re-read the bound document/note).
 */

import { createAsyncThunk } from "@reduxjs/toolkit";
import type { AppDispatch, RootState } from "@/lib/redux/store";
import { NotesAPI } from "@/features/notes/service/notesApi";
import {
  refreshNoteContent,
  saveNoteField,
} from "@/features/notes/redux/thunks";
import {
  applyAgentWorkingDocContent,
  DEFAULT_DOC_KIND,
  markWorkingDocError,
  NO_BINDING,
  setWorkingDocBinding,
  setWorkingDocContent,
  setWorkingDocEnabled,
  setWorkingDocTitle,
  type WorkingDocumentKind,
} from "./instance-working-document.slice";
import {
  selectWorkingDocBinding,
  selectWorkingDocContent,
} from "./instance-working-document.selectors";
import { selectIsCacheOnly } from "@/features/agents/redux/execution-system/conversations/conversations.selectors";
import {
  getConversationDocumentLink,
  getCxWorkingDocumentById,
  getOrCreateConversationDocument,
  linkConversationToDocument,
  setConversationDocumentEnabled,
  updateCxWorkingDocumentContent,
} from "./cx-working-document.service";

interface ThunkConfig {
  state: RootState;
  dispatch: AppDispatch;
}

const DOC_KINDS: WorkingDocumentKind[] = ["working", "scratch"];

/**
 * How to reconcile the current working-document content when binding to a note
 * that the user picked while content already exists.
 *   - "replace" — discard current content, adopt the note's content.
 *   - "append"  — keep both: the note's content on top, the current document
 *                 appended below (persisted back to the note so nothing is lost).
 */
export type BindNoteMode = "replace" | "append";

// =============================================================================
// Hydrate — restore persisted opt-in/link on mount
// =============================================================================

/**
 * Restore the conversation's persisted document state for every kind from the
 * `cx_conversation_documents` junction. Opt-in is durable: a doc the user
 * turned on (or linked to another conversation's doc) comes back enabled and
 * bound after a reload. A kind with no junction row stays OFF (the opt-in
 * default). READ-ONLY — never provisions.
 */
export const hydrateConversationDocumentsThunk = createAsyncThunk<
  void,
  { conversationId: string },
  ThunkConfig
>(
  "instanceWorkingDocument/hydrate",
  async ({ conversationId }, { dispatch }) => {
    await Promise.all(
      DOC_KINDS.map(async (kind) => {
        try {
          const link = await getConversationDocumentLink(conversationId, kind);
          if (!link) return; // never used → stays off (opt-in default)

          dispatch(
            setWorkingDocEnabled({
              conversationId,
              kind,
              enabled: link.enabled,
            }),
          );
          if (!link.enabled) return;

          const doc = await getCxWorkingDocumentById(link.documentId);
          if (!doc) return;

          dispatch(
            setWorkingDocBinding({
              conversationId,
              kind,
              binding: {
                kind: "cx_working_document",
                id: doc.id,
                label: doc.title,
              },
            }),
          );
          if (doc.title) {
            dispatch(
              setWorkingDocTitle({ conversationId, kind, title: doc.title }),
            );
          }
          dispatch(
            applyAgentWorkingDocContent({
              conversationId,
              kind,
              content: doc.content ?? "",
            }),
          );
        } catch (err) {
          console.error(
            "[working-document] failed to hydrate conversation document",
            { conversationId, kind, err },
          );
        }
      }),
    );
  },
);

// =============================================================================
// Enable / disable (persisted)
// =============================================================================

/**
 * Toggle a document on/off for the conversation AND persist the flag to the
 * junction so it survives reloads. Enabling provisions the durable backing row
 * (+ junction, enabled=true); disabling persists enabled=false.
 */
export const setConversationDocumentEnabledThunk = createAsyncThunk<
  void,
  { conversationId: string; kind?: WorkingDocumentKind; enabled: boolean },
  ThunkConfig
>(
  "instanceWorkingDocument/setEnabled",
  async (
    { conversationId, kind = DEFAULT_DOC_KIND, enabled },
    { dispatch },
  ) => {
    dispatch(setWorkingDocEnabled({ conversationId, kind, enabled }));
    try {
      if (enabled) {
        await dispatch(
          ensureConversationDocumentThunk({ conversationId, kind }),
        ).unwrap();
      } else {
        await setConversationDocumentEnabled(conversationId, kind, false);
      }
    } catch (err) {
      console.error("[working-document] failed to persist enabled flag", {
        conversationId,
        kind,
        enabled,
        err,
      });
      dispatch(
        markWorkingDocError({
          conversationId,
          kind,
          error: "Could not save the document setting.",
        }),
      );
    }
  },
);

// =============================================================================
// Provision durable backing + junction
// =============================================================================

/**
 * Ensure the conversation's (kind) document has a durable `cx_working_documents`
 * backing row and an enabled junction link, and bind to it. Creating the row
 * (working kind) flips the published context value to `persist: "auto"` +
 * `source`, so the agent's `ctx_patch` edits persist and round-trip back.
 *
 * Idempotent and persistence-guaranteeing: in every branch the junction ends
 * up enabled=true. A note overlay (working kind) is left intact — we only
 * ensure the underlying junction exists so reload restores "on".
 */
export const ensureConversationDocumentThunk = createAsyncThunk<
  void,
  { conversationId: string; kind?: WorkingDocumentKind },
  ThunkConfig
>(
  "instanceWorkingDocument/ensure",
  async (
    { conversationId, kind = DEFAULT_DOC_KIND },
    { dispatch, getState },
  ) => {
    // Chokepoint guard: defer ALL durable provisioning until the conversation is
    // server-confirmed (`!cacheOnly`). Until then chat.conversation has no row for
    // this id, so inserting the working_documents / conversation_documents rows
    // violates the conversation_id FK (23503) and historically leaked orphans.
    // Every provisioning caller funnels through here (the reactive context-sync
    // effect, the user enable/disable toggle, note bind/unbind), so guarding here
    // covers them all. The enabled flag + content stay in Redux; the context-sync
    // effect re-dispatches this thunk once `cacheOnly` flips false.
    if (selectIsCacheOnly(conversationId)(getState())) {
      return;
    }

    const binding = selectWorkingDocBinding(conversationId, kind)(getState());

    // Already bound to the durable cx document — just make sure the persisted
    // flag is on.
    if (binding.kind === "cx_working_document" && binding.id) {
      await setConversationDocumentEnabled(conversationId, kind, true);
      return;
    }

    // Session note overlay (working kind): keep it, but ensure a durable
    // junction exists + enabled so the doc reopens "on" after reload.
    if (binding.kind === "note" && binding.id) {
      await getOrCreateConversationDocument(conversationId, kind);
      return;
    }

    // Unbound → provision and adopt the cx document.
    const { document } = await getOrCreateConversationDocument(
      conversationId,
      kind,
    );
    dispatch(
      setWorkingDocBinding({
        conversationId,
        kind,
        binding: {
          kind: "cx_working_document",
          id: document.id,
          label: document.title,
        },
      }),
    );
    if (document.title) {
      dispatch(
        setWorkingDocTitle({ conversationId, kind, title: document.title }),
      );
    }

    const localContent = selectWorkingDocContent(
      conversationId,
      kind,
    )(getState());
    if (document.content) {
      // Row has content (re-opened conversation) — load it as authoritative.
      dispatch(
        applyAgentWorkingDocContent({
          conversationId,
          kind,
          content: document.content,
        }),
      );
    } else if (localContent) {
      // Fresh empty row but the user already typed — push local content up.
      await updateCxWorkingDocumentContent(document.id, localContent);
    }
  },
);

// =============================================================================
// Persist content (external editors — RichDocument edit action, etc.)
// =============================================================================

/**
 * Persist a full content replacement for the conversation's (kind) document
 * from OUTSIDE the live editor — the RichDocument `edit` action (fullscreen
 * editor save), agent-tool writebacks, and any other surface that produces a
 * new document body without owning the panel's debounced draft.
 *
 * Mirrors `useWorkingDocument`'s `commit`: writes the canonical slice content
 * (so every open editor merges it in), then persists to the durable source —
 * the `cx_working_documents` row or the bound note. Unbound documents stay
 * Redux-only (ephemeral). LOUD on failure: marks the slice error and rethrows
 * so the caller's catch surfaces a toast.
 */
export const persistWorkingDocumentContentThunk = createAsyncThunk<
  void,
  { conversationId: string; kind?: WorkingDocumentKind; content: string },
  ThunkConfig
>(
  "instanceWorkingDocument/persistContent",
  async (
    { conversationId, kind = DEFAULT_DOC_KIND, content },
    { dispatch, getState },
  ) => {
    // Canonical content first so every mounted editor reflects the new body.
    dispatch(setWorkingDocContent({ conversationId, kind, content }));

    const binding = selectWorkingDocBinding(conversationId, kind)(getState());

    if (binding.kind === "cx_working_document" && binding.id) {
      try {
        await updateCxWorkingDocumentContent(binding.id, content);
      } catch (err) {
        dispatch(
          markWorkingDocError({
            conversationId,
            kind,
            error: "Could not save the document.",
          }),
        );
        throw err;
      }
      return;
    }

    if (binding.kind === "note" && binding.id) {
      try {
        await dispatch(
          saveNoteField({ noteId: binding.id, field: "content", value: content }),
        ).unwrap();
      } catch (err) {
        dispatch(
          markWorkingDocError({
            conversationId,
            kind,
            error: "Could not save to the bound note.",
          }),
        );
        throw err;
      }
      return;
    }

    // Unbound (ephemeral) — the slice write above is the whole persistence.
  },
);

// =============================================================================
// Cross-conversation linking
// =============================================================================

/**
 * Point this conversation's (kind) document at an EXISTING document (from any
 * of the user's conversations) and adopt its content. Both conversations now
 * share the same document — the agent's edits (working kind) and the user's
 * edits round-trip to every conversation linked to it.
 */
export const linkConversationDocumentThunk = createAsyncThunk<
  void,
  { conversationId: string; kind?: WorkingDocumentKind; documentId: string },
  ThunkConfig
>(
  "instanceWorkingDocument/link",
  async (
    { conversationId, kind = DEFAULT_DOC_KIND, documentId },
    { dispatch },
  ) => {
    try {
      const { document } = await linkConversationToDocument(
        conversationId,
        kind,
        documentId,
      );
      dispatch(setWorkingDocEnabled({ conversationId, kind, enabled: true }));
      dispatch(
        setWorkingDocBinding({
          conversationId,
          kind,
          binding: {
            kind: "cx_working_document",
            id: document.id,
            label: document.title,
          },
        }),
      );
      dispatch(
        setWorkingDocTitle({
          conversationId,
          kind,
          title: document.title ?? "",
        }),
      );
      dispatch(
        applyAgentWorkingDocContent({
          conversationId,
          kind,
          content: document.content ?? "",
        }),
      );
    } catch (err) {
      console.error("[working-document] failed to link document", {
        conversationId,
        kind,
        documentId,
        err,
      });
      dispatch(
        markWorkingDocError({
          conversationId,
          kind,
          error: "Could not link the selected document.",
        }),
      );
    }
  },
);

// =============================================================================
// Note binding (working kind)
// =============================================================================

/**
 * Bind the conversation's working document to an existing note and seed the
 * document content from that note. Enables the document.
 */
export const bindWorkingDocumentToNoteThunk = createAsyncThunk<
  void,
  {
    conversationId: string;
    kind?: WorkingDocumentKind;
    noteId: string;
    mode?: BindNoteMode;
  },
  ThunkConfig
>(
  "instanceWorkingDocument/bindToNote",
  async (
    { conversationId, kind = DEFAULT_DOC_KIND, noteId, mode = "replace" },
    { dispatch, getState },
  ) => {
    try {
      const note = await NotesAPI.getById(noteId);
      if (!note) {
        dispatch(
          markWorkingDocError({
            conversationId,
            kind,
            error: "Could not load the selected note.",
          }),
        );
        return;
      }

      const noteContent = note.content ?? "";
      // "append" keeps the user's current document — the note's content on top,
      // the current document below — and persists the merge back to the note so
      // the bound source is the single source of truth going forward.
      let nextContent = noteContent;
      if (mode === "append") {
        const current = selectWorkingDocContent(
          conversationId,
          kind,
        )(getState());
        if (current.trim()) {
          nextContent = noteContent.trim()
            ? `${noteContent}\n\n${current}`
            : current;
        }
      }

      dispatch(
        setWorkingDocBinding({
          conversationId,
          kind,
          binding: { kind: "note", id: note.id, label: note.label ?? null },
        }),
      );
      if (note.label) {
        dispatch(
          setWorkingDocTitle({ conversationId, kind, title: note.label }),
        );
      }
      dispatch(
        setWorkingDocContent({ conversationId, kind, content: nextContent }),
      );
      dispatch(setWorkingDocEnabled({ conversationId, kind, enabled: true }));

      // Persist the merged content to the note when we changed it, so the bound
      // source actually holds what the user sees.
      if (mode === "append" && nextContent !== noteContent) {
        void dispatch(
          saveNoteField({ noteId, field: "content", value: nextContent }),
        );
      }
    } catch {
      dispatch(
        markWorkingDocError({
          conversationId,
          kind,
          error: "Could not load the selected note.",
        }),
      );
    }
  },
);

/**
 * Unbind the working document from a note and revert to the conversation's own
 * durable `cx_working_documents` document — restoring its own content/title.
 */
export const unbindWorkingDocumentThunk = createAsyncThunk<
  void,
  { conversationId: string; kind?: WorkingDocumentKind },
  ThunkConfig
>(
  "instanceWorkingDocument/unbind",
  async ({ conversationId, kind = DEFAULT_DOC_KIND }, { dispatch }) => {
    // Drop the binding first so no in-flight save targets the note.
    dispatch(
      setWorkingDocBinding({
        conversationId,
        kind,
        binding: { ...NO_BINDING },
      }),
    );
    try {
      const { document } = await getOrCreateConversationDocument(
        conversationId,
        kind,
      );
      dispatch(
        setWorkingDocBinding({
          conversationId,
          kind,
          binding: {
            kind: "cx_working_document",
            id: document.id,
            label: document.title,
          },
        }),
      );
      // Revert the editor to the document's own content + title.
      dispatch(
        setWorkingDocContent({
          conversationId,
          kind,
          content: document.content ?? "",
        }),
      );
      dispatch(
        setWorkingDocTitle({
          conversationId,
          kind,
          title: document.title ?? "",
        }),
      );
    } catch (err) {
      console.error(
        "[working-document] failed to revert to cx_working_documents row on unbind",
        { conversationId, kind, err },
      );
      dispatch(
        markWorkingDocError({
          conversationId,
          kind,
          error: "Could not revert the working document.",
        }),
      );
    }
  },
);

// =============================================================================
// Agent writeback resync
// =============================================================================

/**
 * Resolve an agent writeback for the working document. Called from the stream
 * processor when a `context_changed` / `context_persisted` event arrives for
 * the `working_document` key. The event carries no content, so we re-read the
 * bound durable source (the cx document — by its OWN id, so linked
 * conversations resolve — or the bound note) and apply it.
 *
 * LOUD on failure: a recovery firing means a real change came through that we
 * could not reflect — we log it so the gap is visible rather than silent.
 */
export const syncWorkingDocumentFromAgentThunk = createAsyncThunk<
  void,
  { conversationId: string; kind?: WorkingDocumentKind },
  ThunkConfig
>(
  "instanceWorkingDocument/syncFromAgent",
  async (
    { conversationId, kind = DEFAULT_DOC_KIND },
    { dispatch, getState },
  ) => {
    const binding = selectWorkingDocBinding(conversationId, kind)(getState());

    if (binding.kind === "cx_working_document" && binding.id) {
      try {
        const doc = await getCxWorkingDocumentById(binding.id);
        if (doc) {
          dispatch(
            applyAgentWorkingDocContent({
              conversationId,
              kind,
              content: doc.content ?? "",
            }),
          );
        }
      } catch (err) {
        console.error(
          "[working-document] failed to resync cx_working_documents row after agent writeback",
          { conversationId, kind, docId: binding.id, err },
        );
      }
      return;
    }

    if (binding.kind === "note" && binding.id) {
      try {
        const note = await dispatch(refreshNoteContent(binding.id)).unwrap();
        if (note) {
          dispatch(
            applyAgentWorkingDocContent({
              conversationId,
              kind,
              content: note.content ?? "",
            }),
          );
        }
      } catch (err) {
        console.error(
          "[working-document] failed to resync bound note after agent writeback",
          { conversationId, kind, noteId: binding.id, err },
        );
      }
      return;
    }

    // Unbound: the stream event carries no content and there is no durable
    // source to re-read. Nothing we can reflect (see backend caveat).
  },
);
